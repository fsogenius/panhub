/**
 * 搜索主流程（第三方静态站版）
 *
 * 只有一条通道：SSE 长连接 `/api/search.stream`。
 * 服务端受控并发逐批抓取，每完成一批推送一个 chunk，前端边收边渲染。
 *
 * 为什么不做「非流式回退」：官方 API 的 SSE 通道稳定可用，多留一条回退
 * 路径只会让前端多维护一套批次调度逻辑（countOnly 取批数 + 分批并发），
 * 而正常使用中永远不会触发。这里保持单通道，逻辑更少、更可读。
 *
 * 「继续搜索」：回传 skipTasks（已完成任务索引）+ initialTotal（已有结果数），
 * 服务端只跑未搜过的任务，按「已有 + 本轮新增 ≥ 目标值」自行停止。
 */
import { computed, ref } from "vue";
import { MAX_RESULTS_PER_ROUND } from "../config";
import { apiUrl, authHeaders } from "../api/client";
import { getAnonTicketSafe } from "../api/auth";
import type { MergedLinks } from "../types";
import { countMerged, mergeMergedByType } from "../utils/merge";

export interface SearchOptions {
  keyword: string;
  /** 类别搜索（空 = 全部网盘） */
  cat?: string;
  /** 服务端返回 401 时回调（登录态失效，需要重新认证） */
  onAuthRequired?: () => void;
}

interface ParsedSSEEvent {
  event: string;
  data: string;
}

/** 解析一行 SSE 事件块（event:xxx\ndata:yyy） */
function parseSSEEventBlock(raw: string): ParsedSSEEvent | null {
  const lines = raw.split("\n");
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

export function useSearch() {
  const state = ref({
    loading: false,
    deepLoading: false,
    paused: false,
    error: "",
    searched: false,
    elapsedMs: 0,
    total: 0,
    merged: {} as MergedLinks,
  });

  let searchSeq = 0;
  /** 新搜索时保留旧结果展示，首批新结果到达后整体替换（丝滑搜索） */
  let freshSearch = true;
  const activeControllers: AbortController[] = [];
  const autoPausedAtLimit = ref(false);
  /** 断点续跑：已完成的内部任务索引 */
  let completedTaskGidx = new Set<number>();

  function cancelActiveRequests(): void {
    for (const controller of activeControllers) {
      try {
        controller.abort();
      } catch {}
    }
    activeControllers.length = 0;
  }

  function pauseSearch(): void {
    if (state.value.loading || state.value.deepLoading) {
      autoPausedAtLimit.value = false;
      state.value.paused = true;
      cancelActiveRequests();
    }
  }

  function resetSearch(): void {
    cancelActiveRequests();
    searchSeq++;
    autoPausedAtLimit.value = false;
    completedTaskGidx.clear();
    state.value.loading = false;
    state.value.deepLoading = false;
    state.value.paused = false;
    state.value.error = "";
    state.value.searched = false;
    state.value.elapsedMs = 0;
    state.value.total = 0;
    state.value.merged = {};
  }

  /**
   * SSE 搜索：一个长连接承载整个搜索。
   *
   * @param initialMerged 「继续」时传入已有结果，避免覆盖
   * @param initialTotal  前端已有结果数，参与服务端上限判断
   * @param maxResults    本轮目标总数（首搜不传 = 服务端默认 90）
   */
  async function runStream(
    options: SearchOptions,
    mySeq: number,
    initialMerged?: MergedLinks,
    initialTotal = 0,
    maxResults?: number
  ): Promise<void> {
    const { keyword, cat, onAuthRequired } = options;

    const params: Record<string, string | number | undefined> = { kw: keyword };
    if (cat) params.cat = cat;
    // 匿名票据（对齐官方站 2026-09-24 访客准入）：建连前拼在 URL 上（流式连接
    // 不能靠 401 重试补票）。拿不到 → 不带，服务端对无票访客按策略放行（fail-open）
    const anonTicket = await getAnonTicketSafe().catch(() => null);
    if (anonTicket) params.at = anonTicket;
    if (maxResults != null && maxResults > 0) params.maxResults = maxResults;
    // 断点续跑：回传已完成任务索引，服务端只跑未搜过的
    if (completedTaskGidx.size > 0) {
      params.skipTasks = [...completedTaskGidx].join(",");
    }
    if (initialTotal > 0) params.initialTotal = initialTotal;

    const controller = new AbortController();
    activeControllers.push(controller);

    let currentMerged: MergedLinks = initialMerged ? { ...initialMerged } : {};

    try {
      const resp = await fetch(apiUrl("/search.stream", params), {
        signal: controller.signal,
        // 跨域 + 通配 CORS，必须 omit；认证只靠 Authorization 头
        credentials: "omit",
        headers: { accept: "text/event-stream", ...authHeaders() },
      });

      if (resp.status === 401) {
        onAuthRequired?.();
        return;
      }
      if (!resp.ok) {
        state.value.error = `搜索服务暂时不可用（${resp.status}），请稍后重试`;
        return;
      }
      if (!resp.body) {
        state.value.error = "当前浏览器不支持流式搜索，请更换浏览器后重试";
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx = -1;
        while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const evt = parseSSEEventBlock(raw);
          if (!evt) continue;

          // 已重置 / 已暂停 → 主动断开
          if (mySeq !== searchSeq || state.value.paused) {
            controller.abort();
            return;
          }

          if (evt.event === "chunk") {
            try {
              const payload = JSON.parse(evt.data);
              if (payload.merged) {
                currentMerged = freshSearch
                  ? payload.merged
                  : mergeMergedByType(currentMerged, payload.merged);
                freshSearch = false;
                state.value.merged = currentMerged;
                state.value.total = countMerged(currentMerged);
              }
            } catch {}
          } else if (evt.event === "done") {
            try {
              const payload = JSON.parse(evt.data);
              // done 的 merged 同样走合并去重，绝不直接覆盖：
              // 服务端 acc 是本次连接的累计快照，「继续」时缓存失效会导致
              // acc < 前端已有结果，直接覆盖会丢数据
              if (
                payload.merged &&
                (freshSearch || Object.keys(payload.merged).length > 0)
              ) {
                currentMerged = freshSearch
                  ? payload.merged
                  : mergeMergedByType(currentMerged, payload.merged);
                state.value.merged = currentMerged;
              }
              freshSearch = false;
              // total 始终按前端真实数据重算，避免数字被服务端快照覆盖变小
              state.value.total = countMerged(currentMerged);

              if (Array.isArray(payload.completedIndices)) {
                for (const i of payload.completedIndices) {
                  const n = Number(i);
                  if (Number.isFinite(n)) completedTaskGidx.add(n);
                }
              }
              // 服务端已因达到上限停止剩余任务 → 展示「继续」
              if (payload.reachedLimit) {
                autoPausedAtLimit.value = true;
                state.value.paused = true;
                // 保持 loading=true，让「继续」按钮可见
              }
            } catch {}
            return;
          } else if (evt.event === "error") {
            try {
              const payload = JSON.parse(evt.data);
              state.value.error = payload.message || "搜索异常";
            } catch {}
            return;
          }
        }
      }
    } catch (error: any) {
      // 主动 abort（暂停 / 重置）不算失败
      const isAbort =
        error?.name === "AbortError" || error?.cause?.name === "AbortError";
      if (!isAbort) {
        state.value.error = "网络异常，搜索中断，请重试";
      }
    } finally {
      const idx = activeControllers.indexOf(controller);
      if (idx >= 0) activeControllers.splice(idx, 1);
    }
  }

  async function performSearch(options: SearchOptions): Promise<void> {
    const keyword = (options.keyword || "").trim();
    if (!keyword) {
      state.value.error = "请输入搜索关键词";
      return;
    }
    // iOS Safari：搜索前先收起键盘
    if (
      typeof window !== "undefined" &&
      document.activeElement instanceof HTMLInputElement
    ) {
      document.activeElement.blur();
      await new Promise((r) => setTimeout(r, 100));
    }

    state.value.loading = true;
    state.value.error = "";
    state.value.searched = true;
    state.value.elapsedMs = 0;
    state.value.deepLoading = false;
    freshSearch = true;
    completedTaskGidx.clear();
    autoPausedAtLimit.value = false;

    const mySeq = ++searchSeq;
    const start = performance.now();

    try {
      await runStream(options, mySeq);
      if (mySeq !== searchSeq) return;
    } catch (error: any) {
      state.value.error = error?.message || "请求失败";
    } finally {
      state.value.elapsedMs = Math.round(performance.now() - start);
      // 暂停时保持 loading=true，让「继续」按钮留在原位
      if (!state.value.paused) state.value.loading = false;
      state.value.deepLoading = false;
    }
  }

  async function continueSearch(options: SearchOptions): Promise<void> {
    if (!state.value.paused || !state.value.searched) return;

    state.value.paused = false;
    state.value.deepLoading = true;
    const resumingFresh = freshSearch;
    freshSearch = false;
    // 本轮是新搜索但首批结果还没到（屏幕上是上一轮旧结果）时，
    // 不能拿旧结果当合并基底，否则两个关键词的结果会混在一张列表里
    const resumeBase = resumingFresh ? undefined : state.value.merged;
    const resumeTotal = resumingFresh ? 0 : state.value.total;
    const targetMax = resumeTotal + MAX_RESULTS_PER_ROUND;
    autoPausedAtLimit.value = false;

    try {
      await runStream(options, searchSeq, resumeBase, resumeTotal, targetMax);
    } catch {
      // 错误已在 runStream 内落库
    } finally {
      state.value.deepLoading = false;
      if (!state.value.paused) state.value.loading = false;
    }
  }

  return {
    loading: computed(() => state.value.loading),
    deepLoading: computed(() => state.value.deepLoading),
    paused: computed(() => state.value.paused),
    error: computed(() => state.value.error),
    searched: computed(() => state.value.searched),
    elapsedMs: computed(() => state.value.elapsedMs),
    total: computed(() => state.value.total),
    merged: computed(() => state.value.merged),
    hasResults: computed(() => Object.keys(state.value.merged).length > 0),
    autoPausedAtLimit: computed(() => autoPausedAtLimit.value),
    performSearch,
    continueSearch,
    pauseSearch,
    resetSearch,
  };
}
