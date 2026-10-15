/**
 * 「获取」交互（转存链路的前端一半，与官方站同一套协议）
 *
 * 前端只持有一个轻量状态：key → idle | loading | done | dead。
 * 真正的转存编排全在服务端 POST /api/transfer（鉴权/限频/缓存/回退），
 * 前端不做任何链接解析——没有 tid 的链接不出现「获取」按钮。
 *
 * 为什么第三方站点也必须走这个接口：
 * 服务端对已接入转存的盘型会剥离真实直链、只下发 tid，
 * 因此只有调 /api/transfer 才能换回可用的分享链接。
 *
 * 响应分支（服务端 2026-09 起的完整协议，缺一不可）：
 * - code 1 + dead            → 确定性失效，禁用该条目
 * - code 0 + limited         → 当日该盘型获取达上限
 * - code 0 + fallback        → 未拿到新链接，中性原因 + 原链接仍可复制
 * - code 0 + share_url       → 成功
 * - 无 tid                   → 把 url 交给后端，由服务端统一交付原链接
 */
import { computed, ref } from "vue";
import { ApiError, apiPost } from "../api/client";
import { getAnonTicketSafe } from "../api/auth";
import { buildShareText, driverOf } from "../utils/shareText";

export type TransferStatus = "idle" | "loading" | "done" | "dead";

/** 模块级单例：跨 ResultGroup 实例共享状态与弹窗 */
const statusMap = ref<Record<string, TransferStatus>>({});
/** key → 已生成的口令文本（done 后再点不再请求后端） */
const shareTextCache = ref<Record<string, string>>({});

/**
 * 交付的结构化信息（2026-09-21）：弹窗要现场出「资源二维码」，需要裸
 * share_url + passcode + 盘型，而 shareTextCache 里存的是整段中文口令
 * （做出来是一张密到扫不动的码），故单独缓存一份原始字段。
 */
type ShareDelivery = {
  url: string;
  passcode: string;
  name: string;
  driver: string;
};
const shareDeliveryCache = ref<Record<string, ShareDelivery>>({});

/** 记录一次交付（url 为空则不记，调用方按「没有码」处理） */
function rememberDelivery(key: string, data: any, url: string): void {
  const link = String(url || "").trim();
  if (!link) return;
  shareDeliveryCache.value[key] = {
    url: link,
    passcode: String(data?.passcode || ""),
    name: String(data?.name || ""),
    // 后端下发的 driver 是权威值（"other" 表示未接入转存的盘型）；
    // 早期路径没有该字段时按链接域名兜底
    driver: String(data?.driver || driverOf(link) || ""),
  };
}

/** key → 失效原因（dead 后再点直接展示） */
const deadMsgCache = ref<Record<string, string>>({});
/** 底部 toast（限流/忙等轻提示） */
const toast = ref("");
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** 全局在跑的「获取」动作数：>0 时禁止再发起新的获取 */
const busyCount = ref(0);
const anyBusy = computed(() => busyCount.value > 0);

/**
 * 「立即获取」弹窗 loading 态的最短展示时长（ms）。
 *
 * 为什么必须有：五盘是真实转存（实测 5~30s），而非五盘 / 命中缓存走的是
 * 「原链接交付」——后端毫秒级就返回，弹窗会闪一下直接跳「获取成功」，用户会
 * 以为「根本没请求」（同小程序端 TRANSFER_AD_MIN_MS = 3000 的处理）。
 * 补足到最短时长，等待期的转圈才是可信的。
 *
 * 只对**会落到弹窗结果态**的路径补齐（成功 / 失效 / 回退 / 无兜底）；
 * 限流不补——那一条直接给下一步动作（换网盘/明天再来），让用户白等没有意义。
 */
const MIN_LOADING_MS = 3000;

/** 把 loading 态补足到最短展示时长（超过则立即返回，不额外等待） */
async function ensureMinLoading(startedAt: number): Promise<void> {
  const remain = MIN_LOADING_MS - (Date.now() - startedAt);
  if (remain > 0) await new Promise((r) => setTimeout(r, remain));
}

// —— 内置等待/资源弹窗（components/TransferStatusDialog.vue）——
// 交互（2026-09-21 改版，PC 转移动端）：点击「获取」即弹「正在获取」；
// 拿到资源后不再给「复制」主按钮，改为直接摊开资源本身——桌面端出**资源二维码**
// （扫码用对应网盘 APP 打开，走移动端保存），手机端给**可直接点开的资源地址** +
// 行内复制按钮。成功后不自动关，由用户手动关闭。
type TransferDialogStatus =
  | "loading"
  | "ready"
  | "dead"
  | "fallback"
  | "limited"
  | "error";

const dialogOpen = ref(false);
const dialogStatus = ref<TransferDialogStatus>("loading");
const dialogMsg = ref("");
const dialogKey = ref("");

/** 打开弹窗：ready=false → 「正在获取」；ready=true → 直接资源态 */
function openTransferDialog(key: string, ready = false): void {
  dialogKey.value = key;
  dialogStatus.value = ready ? "ready" : "loading";
  dialogMsg.value = "";
  dialogOpen.value = true;
}

function closeTransferDialog(): void {
  dialogOpen.value = false;
}

/** 弹窗内失败/失效态：展示原因，弹窗仍由用户手动关闭 */
function failTransferDialog(msg: string, status: TransferDialogStatus = "error"): void {
  dialogStatus.value = status;
  dialogMsg.value = msg;
}

/** 当前弹窗条目的结构化交付信息（二维码视图用）；没有交付过则为 null */
const dialogDelivery = computed<ShareDelivery | null>(
  () => shareDeliveryCache.value[dialogKey.value] || null
);

/** 弹窗视图层绑定：components/TransferStatusDialog.vue 使用 */
export function useTransferDialog() {
  return {
    dialogOpen,
    dialogStatus,
    dialogDelivery,
    dialogMsg,
    closeTransferDialog,
  };
}

/**
 * 401 时的登录回调（模块级单例）：页面入口（App.vue）注册一次，
 * 任意组件触发的「获取」（ResultGroup 等）共享同一处理器——吊起 wx-auth
 * SDK 登录弹窗并等登录结果，登录成功后自动重试本次获取。
 */
let authRequiredHandler: (() => Promise<boolean> | boolean) | null = null;

/**
 * @param onAuthRequired 请求返回 401（未登录）时回调（对齐官方站 2026-09-24：
 *        搜索对访客放开后，登录卡点收敛到「获取」——直接吊起 wx-auth SDK 登录
 *        弹窗，**等同用户手动点登录**；返回 true（登录成功）后本次获取自动重试，
 *        不打断流程）
 */
export function useTransfer(onAuthRequired?: () => Promise<boolean> | boolean) {
  // 模块级注册（后注册覆盖前者；ResultGroup 等无参调用不覆盖）
  if (onAuthRequired) authRequiredHandler = onAuthRequired;

  function showToast(msg: string) {
    toast.value = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = "";
    }, 4000);
  }

  function statusOf(key?: string): TransferStatus {
    return (key && statusMap.value[key]) || "idle";
  }

  /**
   * 点击「获取」——所有条目统一入口：前端不区分哪些盘型接了转存。
   * 有 tid → 真实转存（后端按链接分派）；没有 tid → 传 url，后端交付原链接。
   * 两者都**必须**经过 /api/transfer：前端没有任何「本地直接给链接」的快捷路径。
   * 「复制」按钮已下线，「获取」是唯一动作。
   */
  async function requestTransfer(item: {
    tid?: string;
    url: string;
    name?: string;
  }): Promise<void> {
    const key = item.tid || item.url;
    if (!key) return;
    const current = statusOf(key);

    // 已成功过（done）：不再请求后端，弹窗直接进资源态
    if (current === "done" && shareTextCache.value[key]) {
      openTransferDialog(key, true);
      return;
    }
    if (current === "dead") {
      showToast(deadMsgCache.value[key] || "该资源已失效，无法获取");
      return;
    }
    if (current === "loading") return;
    // 全局单点：同一时刻页面只允许一个「获取」在跑
    if (busyCount.value > 0) {
      showToast("正在获取其他资源，请稍候");
      return;
    }

    busyCount.value++;
    statusMap.value[key] = "loading";
    openTransferDialog(key);
    // 补时基准：从弹窗亮起那一刻算（见 MIN_LOADING_MS）
    const startedAt = Date.now();
    const finish = () => {
      busyCount.value = Math.max(0, busyCount.value - 1);
    };

    try {
      // 一律走后端换链接：有 tid → 服务端按注册表换回原链接再转存；
      // 没有 tid（正版合规源 / 旧缓存数据）→ 把 url 一并交给服务端，
      // 由它统一交付原链接。前端没有任何本地旁路。
      // 匿名票据（对齐官方站 2026-09-24）：登录用户「获取」时顺手带上，服务端
      // 验签通过后沉淀 (openid, anonId) 绑定；拿不到不影响主流程
      const doFetchTransfer = async () => {
        const payload: Record<string, unknown> = item.tid
          ? { id: item.tid }
          : { url: item.url, name: item.name };
        const anonTicket = await getAnonTicketSafe().catch(() => null);
        if (anonTicket) payload.at = anonTicket;
        return apiPost<{ code: number; data: any }>("/transfer", payload);
      };
      let shareText = item.url;
      // 401 自动续跑（访客准入配套）：未登录时**直接吊起 wx-auth SDK 登录弹窗**
      //（等同用户手动点登录），登录成功后自动重试本次获取——不弹「获取失败」、
      // 不需要再点一次。
      let resp: { code: number; data: any };
      for (let attempt = 0; ; attempt++) {
        try {
          resp = await doFetchTransfer();
          break;
        } catch (e) {
          const unauthorized =
            (e instanceof ApiError && e.statusCode === 401) ||
            (e instanceof ApiError && e.data?.code === "UNAUTHORIZED");
          if (attempt === 0 && unauthorized && authRequiredHandler) {
            statusMap.value[key] = "idle";
            // 先收起「正在获取」弹窗：它的 z-index 高于 SDK 登录弹窗，
            // 不收起会把登录二维码盖住（官方站线上实测）
            closeTransferDialog();
            const ok = await authRequiredHandler();
            if (!ok) {
              // 登录中断/失败：恢复弹窗给提示
              openTransferDialog(key);
              failTransferDialog("登录成功后请再点一次「获取」", "error");
              return;
            }
            // 登录成功：恢复「正在获取」并自动重试（仅一次，防死循环）
            openTransferDialog(key);
            continue;
          }
          throw e;
        }
      }
      // 响应处理（与请求分离：401 重试只重发请求，处理逻辑只跑一次）
      try {
        // ① 确定性失效：链接不可用，弹窗内给原因
        if (resp.code === 1 && resp.data?.dead) {
          const msg =
            typeof resp.data.message === "string" && resp.data.message
              ? resp.data.message
              : "该资源暂无法获取";
          deadMsgCache.value[key] = msg;
          statusMap.value[key] = "dead";
          await ensureMinLoading(startedAt);
          failTransferDialog(msg, "dead");
          return;
        }

        // ② 每日限流（按盘型）：当天只停该盘型，提示换网盘或明天再来。
        //    不缓存失败提示（次日重试就有意义，与 dead 不同）
        if (resp.code === 0 && resp.data?.limited) {
          const msg =
            typeof resp.data.message === "string" && resp.data.message
              ? resp.data.message
              : "你今天获取这个网盘的次数已经很多了，换个网盘试试或者明天再来吧。";
          statusMap.value[key] = "idle";
          failTransferDialog(msg, "limited");
          return;
        }

        // ③ 未获取到新链接（风控/容量等）：中性原因 + 保留原链接复制入口；
        //    状态回 idle，稍后可重试
        if (resp.code === 0 && resp.data?.fallback) {
          const msg =
            typeof resp.data.message === "string" && resp.data.message
              ? resp.data.message
              : "未能获取到新链接，已为你准备原始链接";
          const origin = resp.data.share_url || item.url;
          if (origin) {
            // 兜底也是交付（2026-09-21 用户反馈）：复制给用户的必须是**口令文本**，
            // 裸 URL 粘进各盘 APP 没反应（APP 靠剪贴板识别口令）——同时留一份结构化
            // 数据，桌面端 fallback 也照常出资源二维码
            shareTextCache.value[key] = buildShareText({ ...resp.data, share_url: origin });
            rememberDelivery(key, resp.data, origin);
          }
          statusMap.value[key] = "idle";
          await ensureMinLoading(startedAt);
          failTransferDialog(msg, origin ? "fallback" : "error");
          return;
        }

        // ④ 成功：拼官方口令 + 结构化字段单独留一份给二维码
        if (resp.code === 0 && resp.data?.share_url) {
          shareText = buildShareText(resp.data);
          rememberDelivery(key, resp.data, resp.data.share_url);
        }
      } catch (e) {
        // 401 已在上面的重试循环里处理（吊登录弹窗 + 自动重试），
        // 走到这里的是登录后仍失败或其他 HTTP 错误（配额/tid 过期等）：
        // 后端响应里带原链接则兜底。
        // 两道过滤：必须是 http(s)、且不含 /api/（接口路径不会是资源链接）。
        const raw = e instanceof ApiError ? String(e.data?.url || "") : "";
        const candidate = /^https?:\/\//i.test(raw) && !raw.includes("/api/") ? raw : "";
        shareText = shareText || candidate;
        // 兜底交付的同样是「能打开的链接」，也要留结构化数据——否则资源面板拿不到
        // 链接，获取成功了却渲染成空视图（不论盘型、不论走哪条交付路径，
        // 只要有链接就摊开地址/二维码）
        if (shareText) rememberDelivery(key, e instanceof ApiError ? e.data || {} : {}, shareText);
      }

      // 兜底也没拿到链接（tid 过期/未登录，且直链已被剥离）：不能假装获取成功
      if (!shareText) {
        statusMap.value[key] = "idle";
        await ensureMinLoading(startedAt);
        failTransferDialog("内容已过期，请重新搜索后再获取");
        return;
      }
      shareTextCache.value[key] = shareText;
      statusMap.value[key] = "done";
      // 成功同样补足最短 loading：非五盘/缓存命中的交付是毫秒级的，
      // 不补会让弹窗一闪就跳到「获取成功」，用户以为根本没请求
      await ensureMinLoading(startedAt);
      openTransferDialog(key, true);
    } finally {
      finish();
    }
  }

  return {
    statusMap,
    toast,
    statusOf,
    requestTransfer,
    anyBusy,
  };
}
