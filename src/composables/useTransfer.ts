/**
 * 「获取」交互（纯前端直出模式）
 *
 * 前端只持有一个轻量状态：key → idle | loading | done | dead。
 *
 * 本版本不再调用 POST /api/transfer（该接口要求登录），而是直接使用搜索结果里
 * 的原始分享链接交付。注意：服务端对已接入转存的盘型会剥离直链、只下发 tid，
 * 这类条目没有 url，无法直接交付（会提示未提供原始链接）。没有 tid / 仍带
 * url 的条目可正常打开。
 */
import { computed, ref } from "vue";
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

export function useTransfer() {
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
   * 点击「获取」——纯前端直接交付搜索结果里的原始分享链接，不调用 /api/transfer。
   * 服务端对已接入转存的盘型剥离了直链、只留 tid，这类条目没有 url，会提示
   * 「未提供原始链接」，需要重新搜索或改用其它来源。
   */
  async function requestTransfer(item: {
    tid?: string;
    url: string;
    name?: string;
    password?: string;
  }): Promise<void> {
    const key = item.tid || item.url;
    if (!key) return;
    const current = statusOf(key);

    // 已成功过（done）：弹窗直接进资源态
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
    const finish = () => {
      busyCount.value = Math.max(0, busyCount.value - 1);
    };

    try {
      const link = String(item.url || "").trim();
      // 被服务端剥离直链的条目（只有 tid、没有 url）无法本地还原，明确告知
      if (!link) {
        statusMap.value[key] = "idle";
        failTransferDialog("该资源未提供原始链接，无法直接获取");
        return;
      }

      const passcode = String(item.password || "");
      const name = String(item.name || "");
      shareTextCache.value[key] = buildShareText({
        share_url: link,
        passcode,
        name,
      });
      rememberDelivery(key, { name, passcode, driver: driverOf(link) || "" }, link);
      statusMap.value[key] = "done";
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
