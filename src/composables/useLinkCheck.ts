/**
 * 链接有效性检测（前端异步懒查，与官方站同一口径）
 *
 * 搜索结果正常渲染后，单独调 POST /api/check 探活当前可见链接，
 * 结果回来再画角标 —— 不阻塞搜索返回。
 * 服务端已有分级 TTL 缓存 + inflight 合并，同一链接不会重复探活。
 *
 * 2026-09-16：**改按 tid 上报**。后端下发前已全量剥离直链（含 115/天翼/阿里等
 * 非五盘），前端手里只有 tid，所以探活也改成只报 tid，由服务端用注册表换回
 * (url, password) 再探。索引键统一取 `tid || url`：注册表保证同一链接在有效期内
 * 只对应一个 tid，重搜换了新 tid 也不会出现「同一条链接两套键」的问题；
 * 服务端探活结果按归一化 URL 缓存，所以换 tid 不会重新打上游。
 *
 * 注意：`locked`（需提取码）自 2026-09-16 起**不再由服务端下发**——探活出口已把它
 * 归并为 `ok`（需提取码的资源照样能转存拿到，标出来只会误导用户）。这里保留它只为
 * 兼容可能仍在跑的旧后端响应，前端已无任何展示分支，不要再加回来。
 */
import { ref } from "vue";
import { apiPost } from "../api/client";
import { getAnonTicketSafe } from "../api/auth";

export type LinkCheckStatus =
  | "ok"
  | "bad"
  | "locked"
  | "unsupported"
  | "uncertain";

export interface CheckStatus {
  /** 索引键（tid || url），前端据此查状态 */
  key: string;
  /** 服务端实际探活的原链接（调试/展示用） */
  url: string;
  status: LinkCheckStatus;
  reason?: string;
}

/** 待探活条目：新客户端只带 tid，旧路径带 url(+password) */
export interface CheckTarget {
  tid?: string;
  url?: string;
  password?: string;
}

interface CheckResponse {
  code: number;
  message: string;
  data: {
    results: Array<{
      tid?: string;
      url: string;
      status: LinkCheckStatus;
      reason?: string;
    }>;
  };
}

/** 单次探活请求的最大链接数（与后端一致） */
const MAX_LINKS_PER_REQUEST = 50;

/** 索引键：与后端注册表一对一，tid 优先 */
function keyOf(l: CheckTarget): string {
  return l.tid || l.url || "";
}

/** 上报体：有 tid 只发 tid（服务端自己换链接与提取码），否则退回 url + password */
function payloadOf(l: CheckTarget) {
  if (l.tid) return { tid: l.tid };
  return { url: l.url, password: l.password };
}

/** 模块级单例（跨组件共享状态，避免重复请求） */
function createStore() {
  const statusMap = ref<Record<string, CheckStatus>>({});
  // 请求中的键集合，防止同批次重复入队
  const inFlight = new Set<string>();
  let queueTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingQueue: CheckTarget[] = [];
  // 失败重试（对齐官方站 2026-09-24）：429 频控/网络抖动是暂时的，60s 后自动
  // 重新入队；每条最多重试 2 次，防止接口持续异常时无限循环（服务端按 URL
  // 缓存，重试的外呼成本有界）
  const RETRY_DELAY_MS = 60_000;
  const MAX_RETRY_PER_TID = 2;
  const retryCount = new Map<string, number>();
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    queueTimer = null;
    const batch = pendingQueue;
    pendingQueue = [];
    if (batch.length === 0) return;

    const items = batch.slice(0, MAX_LINKS_PER_REQUEST);
    // 标记在途，防止同批次重复入队
    for (const it of items) inFlight.add(keyOf(it));

    // 匿名票据（对齐官方站 2026-09-24 访客准入）：探活对访客同口径放行
    //（服务端紧档频控），请求前把票拼在 URL 上；拿不到 → 不带，服务端按无票策略处理
    const atPromise = getAnonTicketSafe().catch(() => null);

    atPromise
      .then((at) =>
        apiPost<CheckResponse>(
          at ? `/check?at=${encodeURIComponent(at)}` : "/check",
          { items: items.map(payloadOf) }
        )
      )
      .then((res) => {
        const results = res?.data?.results || [];
        if (results.length === 0) return;
        const next = { ...statusMap.value };
        for (const r of results) {
          const key = r.tid || r.url;
          if (!key) continue;
          next[key] = { key, url: r.url, status: r.status, reason: r.reason };
          retryCount.delete(key);
        }
        statusMap.value = next;
      })
      .catch(() => {
        // 静默失败：角标不显示，不影响搜索体验。
        // 延迟重新入队（限次数）：被频控/网络抖动的批次角标缺失只是暂时的
        retryTimer = setTimeout(() => {
          retryTimer = null;
          for (const it of items) {
            const key = keyOf(it);
            if (statusMap.value[key] || inFlight.has(key)) continue;
            const count = retryCount.get(key) || 0;
            if (count >= MAX_RETRY_PER_TID) continue;
            retryCount.set(key, count + 1);
            pendingQueue.push(it);
          }
          if (pendingQueue.length > 0 && !queueTimer) {
            queueTimer = setTimeout(flush, 50);
          }
        }, RETRY_DELAY_MS);
      })
      .finally(() => {
        for (const it of items) inFlight.delete(keyOf(it));
      });
  }

  function enqueue(links: CheckTarget[]) {
    for (const l of links) {
      const key = keyOf(l);
      // 既有 tid 也有 url 的老数据：键取 tid，仍走 tid 上报
      if (!key) continue;
      if (statusMap.value[key] || inFlight.has(key)) continue;
      pendingQueue.push(l);
    }
    if (pendingQueue.length > 0 && !queueTimer) {
      // 微批量合并：同一帧内的多次调用合并为一次请求
      queueTimer = setTimeout(flush, 50);
    }
  }

  function statusOf(key: string): CheckStatus | undefined {
    return statusMap.value[key];
  }

  return { statusMap, enqueue, statusOf };
}

let _instance: ReturnType<typeof createStore> | null = null;

export function useLinkCheck() {
  if (!_instance) _instance = createStore();
  return _instance;
}
