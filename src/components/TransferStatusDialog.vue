<template>
  <!-- 「获取」等待/资源弹窗：样式跟全站 token（亮/暗色自动跟随）。
       状态与动作全部来自 useTransfer 模块级单例（useTransferDialog），组件无自有业务状态 -->
  <Teleport to="body">
    <div v-if="dialogOpen" class="tsd-mask" @click.self="closeTransferDialog">
      <div
        class="tsd-modal"
        :class="{ 'tsd-modal--res': showResourcePanel }"
        role="dialog"
        aria-modal="true"
        aria-label="获取资源">
        <button class="tsd-close" type="button" aria-label="关闭" title="关闭" @click="closeTransferDialog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <!-- 标题：给用户的第一个动作指令（随视图切换——二维码视图直接说用哪个 APP 扫码，
             其余状态说当前进展，不出现「微信扫码」这种没有码的承诺） -->
        <h3 class="tsd-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
          {{ dialogTitle }}
        </h3>

        <!-- 资源面板（对齐官方站 2026-09-21，PC → 移动端）：获取成功后不再给「复制」主按钮，
             直接把资源本身摊开——桌面端主视觉是**资源二维码**（PC 上复制口令后大概率
             在电脑上打开保存；扫码转到手机端保存才走移动端结算），地址只做复制、
             不给外链（点开就落到 PC 网页版，与目的相反）；手机端主视觉是**可直接点开
             的资源地址**（手机上点开即移动端流量，省掉"复制→切 APP→粘贴"三步），
             旁边留一个小复制按钮备用。不限盘型：阿里云盘这类未接入转存的同样摊开；
             磁力只给地址不出码（手机没有应用接得住 magnet:）。 -->
        <div v-if="showResourcePanel" class="tsd-status tsd-status--res">
          <template v-if="isDesktop && qrUrlText">
            <p class="tsd-sub">打开{{ qrAppLabel }} → 找到「扫一扫」→ 扫码</p>
            <!-- 没装 APP 的人也必须给一条路：手机相机/浏览器扫码走网页版同样能保存 -->
            <p class="tsd-sub">没装 APP？用手机相机或浏览器扫，网页版也能保存</p>

            <button v-if="qrImage" class="tsd-qr-btn" type="button" title="点击放大" @click="qrZoomed = true">
              <img :src="qrImage" :alt="`${qrAppName}资源二维码`" />
            </button>
            <!-- 出码中 / 出不来：都不阻断，下方资源地址始终可用 -->
            <div v-else class="tsd-qr-box">
              <svg v-if="!qrFailed" class="tsd-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
              <span>{{ qrFailed ? "二维码暂时生成不了，直接复制下方资源地址" : "正在生成二维码…" }}</span>
            </div>

            <p v-if="qrImage" class="tsd-qr-zoom-tip">看不清？点击二维码放大</p>
          </template>

          <div class="tsd-meta">
            <p v-if="qrName" class="tsd-meta-name">名称：{{ qrName }}</p>

            <div class="tsd-meta-row">
              <span class="tsd-meta-label">资源地址：</span>
              <!-- 手机端点开即走（移动端流量）；桌面端不给外链，点开只会落到 PC 网页版 -->
              <a
                v-if="!isDesktop"
                class="tsd-meta-link"
                :href="qrUrlText"
                target="_blank"
                rel="noopener noreferrer">{{ qrUrlText }}</a>
              <span v-else class="tsd-meta-link">{{ qrUrlText }}</span>
              <button class="tsd-meta-copy" type="button" @click="copyField(qrUrlText, 'link')">
                {{ copiedField === "link" ? "已复制" : "复制" }}
              </button>
            </div>

            <!-- 提取码：不一定能塞进二维码（139 是 hash 路由、UC 是公开分享），
                 网盘 APP 没自动填码时用户照着输 -->
            <div v-if="qrPasscode" class="tsd-meta-row">
              <span class="tsd-meta-label">提取码：</span>
              <span class="tsd-meta-code">{{ qrPasscode }}</span>
              <button class="tsd-meta-copy" type="button" @click="copyField(qrPasscode, 'code')">
                {{ copiedField === "code" ? "已复制" : "复制" }}
              </button>
            </div>
          </div>

          <p v-if="!isDesktop" class="tsd-sub">点地址直接打开，或复制后到网盘 APP 粘贴</p>
        </div>

        <!-- 其余状态：正在获取 / 每日限流 / 失效失败（获取成功的资源面板见上） -->
        <template v-else>
          <!-- 正在获取 -->
          <div v-if="dialogStatus === 'loading'" class="tsd-status">
            <svg class="tsd-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <p class="tsd-status-title">正在获取</p>
            <p class="tsd-sub">请稍等片刻…</p>
          </div>

          <!-- 每日限流：当日该盘型达上限，只停该盘型，其他网盘照常可用 -->
          <div v-else-if="dialogStatus === 'limited'" class="tsd-status">
            <p class="tsd-status-title tsd-status-title--fail">{{ dialogMsg }}</p>
            <p class="tsd-sub">每个网盘每天都有一定的获取上限，换个网盘试试吧</p>
          </div>

          <!-- 失效 / 失败：给出原因 -->
          <div v-else class="tsd-status">
            <p class="tsd-status-title tsd-status-title--fail">{{ dialogMsg || "获取失败，请稍后再试" }}</p>
            <p class="tsd-sub" v-if="dialogStatus === 'dead'">该资源已失效</p>
          </div>
        </template>

      </div>

      <!-- 全屏放大：PC 上用户拿手机扫屏幕上的码，码越大越容易识别
           （屏幕缩放、距离都会影响）；点空白处关闭 -->
      <div v-if="qrZoomed && qrImage" class="tsd-zoom" @click="qrZoomed = false">
        <img :src="qrImage" :alt="`${qrAppName}资源二维码`" />
        <p class="tsd-zoom-tip">用{{ qrAppLabel }}扫一扫，保存到手机网盘</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { appNameOf, buildShareQrUrl } from "../utils/shareText";
import { renderQrDataUrl } from "../utils/qrcodeImage";
import { useTransferDialog } from "../composables/useTransfer";

const {
  dialogOpen,
  dialogStatus,
  dialogDelivery,
  dialogMsg,
  closeTransferDialog,
} = useTransferDialog();

// —— 资源二维码 ——
// 只在桌面端展示：手机用户自己扫自己屏幕没有意义，走「点开地址/复制」。
// 用 pointer/hover 能力判断而非 UA 或屏宽——触屏笔记本会被正确判成桌面端
// （用户手边也有手机），手机/平板一律走点开/复制视图。
const isDesktop = ref(false);
onMounted(() => {
  isDesktop.value = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
});

/** 二维码内容：裸分享链接（整段中文口令做出来是一张密到扫不动的码） */
const qrUrlText = computed(() => {
  const d = dialogDelivery.value;
  return d ? buildShareQrUrl(d.url, d.passcode) : "";
});

/** 交付成功（含转存失败退原链接的兜底态）→ 摊开资源本身，不再给「复制」主按钮。
 *  不限盘型（阿里云盘这类未接入转存的同样摊开，行为一致），两端主视觉不同——
 *  桌面端是二维码（手机扫），手机端是可直接点开的资源地址。 */
const showResourcePanel = computed(
  () =>
    (dialogStatus.value === "ready" || dialogStatus.value === "fallback") &&
    !!dialogDelivery.value?.url
);

/** APP 名（二维码标题用）：按链接域名认，认不出退「对应网盘」→ 标题换通用话术 */
const qrAppName = computed(() => appNameOf(dialogDelivery.value?.url));
/** 正文话术里的称呼：认不出盘型时说「网盘 APP」比「对应网盘」顺口 */
const qrAppLabel = computed(() =>
  qrAppName.value === "对应网盘" ? "网盘 APP" : qrAppName.value
);
const qrName = computed(() => dialogDelivery.value?.name || "");
/** 提取码：不一定能塞进二维码（139 是 hash 路由、UC 是公开分享），所以单独
 *  展示 + 可复制——网盘 APP 没自动填码时用户有兜底 */
const qrPasscode = computed(() => dialogDelivery.value?.passcode || "");

const qrImage = ref("");
const qrFailed = ref(false);
const qrZoomed = ref(false);
/** 出码代际：弹窗换条目/关闭时旧结果直接丢弃 */
let qrGen = 0;
watch(
  // 只有桌面端才出码（手机端扫自己屏幕没意义），因此也只在桌面端触发生成
  () => (isDesktop.value && showResourcePanel.value ? qrUrlText.value : ""),
  async (text) => {
    const gen = ++qrGen;
    qrZoomed.value = false;
    qrFailed.value = false;
    qrImage.value = "";
    if (!text) return;
    const dataUrl = await renderQrDataUrl(text);
    if (gen !== qrGen) return;
    qrImage.value = dataUrl;
    qrFailed.value = !dataUrl;
  },
  { immediate: true }
);

/** 资源地址 / 提取码只做复制、不做跳转：外链直跳会落到 PC 网页版，
 *  与「把人往手机端引」的目的正好相反。 */
const copiedField = ref<"link" | "code" | "">("");
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
async function copyField(text: string, field: "link" | "code") {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copiedField.value = "";
    return;
  }
  copiedField.value = field;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copiedField.value = ""), 2000);
}

/** 标题 = 当前该做的动作（桌面端出码时直接给扫码指令） */
const dialogTitle = computed(() => {
  if (showResourcePanel.value) {
    // 桌面端出码时给扫码指令；手机端（或磁力这类不可出码的）就是拿到资源了
    if (isDesktop.value && qrUrlText.value) {
      return qrAppName.value === "对应网盘"
        ? "用手机扫码获取"
        : `请使用 ${qrAppName.value}APP 扫码获取`;
    }
    return dialogStatus.value === "fallback" ? "为你准备了原始链接" : "获取成功";
  }
  if (dialogStatus.value === "loading") return "正在获取";
  // 兜底：拿到交付数据但没走到资源面板（理论不可达）
  if (dialogStatus.value === "ready") return "获取成功";
  if (dialogStatus.value === "fallback") return "为你准备了原始链接";
  if (dialogStatus.value === "limited") return "该网盘今日已达上限";
  if (dialogStatus.value === "dead") return "该资源已失效";
  return "获取失败";
});

// Esc：先收起放大层，再关弹窗
function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (qrZoomed.value) {
    qrZoomed.value = false;
    return;
  }
  if (dialogOpen.value) closeTransferDialog();
}

// 弹窗打开期间锁定页面滚动；关弹窗时收起放大层
watch(dialogOpen, (open) => {
  if (typeof document === "undefined") return;
  document.body.style.overflow = open ? "hidden" : "";
  if (!open) qrZoomed.value = false;
});

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  if (copiedTimer) clearTimeout(copiedTimer);
  if (typeof document !== "undefined") document.body.style.overflow = "";
});
</script>

<style scoped>
/* 遮罩：全屏居中，点空白关闭 */
.tsd-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
  animation: tsd-fade 0.18s ease;
}

/* 弹窗卡片：跟全站主题 token，亮/暗色自动适配 */
.tsd-modal {
  position: relative;
  width: 360px;
  max-width: 92vw;
  max-height: 88vh;
  overflow-y: auto;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-light, rgba(17, 24, 39, 0.08));
  border-radius: 16px;
  box-shadow: 0 24px 48px rgba(17, 24, 39, 0.18);
  padding: 24px 24px 20px;
  text-align: center;
  animation: tsd-rise 0.22s ease;
}

/* 右上角关闭 */
.tsd-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.tsd-close:hover {
  background: var(--bg-hover, rgba(17, 24, 39, 0.06));
  color: var(--text-primary, #111827);
}
.tsd-close svg {
  stroke: currentColor;
}

/* 标题：弹窗第一视觉焦点 */
.tsd-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  line-height: 1.3;
}
.tsd-title svg {
  color: var(--primary, #0f766e);
  flex-shrink: 0;
}

/* 状态区 */
.tsd-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 96px;
  justify-content: center;
  margin-bottom: 12px;
}

.tsd-status-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  line-height: 1.4;
}
.tsd-status-title--ok {
  color: var(--success, #10b981);
}
.tsd-status-title--fail {
  font-size: 15px;
  color: var(--text-secondary, #4b5563);
  font-weight: 600;
}
.tsd-status-title svg {
  stroke: currentColor;
}

.tsd-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary, #6b7280);
  line-height: 1.5;
}

/* 转圈 */
.tsd-spin {
  color: var(--primary, #0f766e);
  animation: tsd-spin 0.8s linear infinite;
}
@keyframes tsd-spin {
  to {
    transform: rotate(360deg);
  }
}

/* —— 资源面板 —— */
/* 桌面端码是主 CTA，卡片给宽一点让码尽量大；手机端只有地址行，宽度无影响 */
.tsd-modal--res {
  width: 400px;
}
.tsd-status--res {
  justify-content: flex-start;
  min-height: 0;
  gap: 10px;
}
.tsd-qr-btn {
  display: block;
  padding: 0;
  border: none;
  background: none;
  line-height: 0;
  cursor: zoom-in;
}
.tsd-qr-btn img {
  width: 240px;
  height: 240px;
  /* 二维码必须白底黑块：暗色模式下也不能跟着反色，反色扫不出来 */
  background: #fff;
  border-radius: 10px;
  border: 1px solid var(--border-light, rgba(17, 24, 39, 0.08));
}
/* 出码中 / 出不来：占位与码同尺寸，避免出码完成时弹窗跳一下 */
.tsd-qr-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 240px;
  height: 240px;
  padding: 12px;
  text-align: center;
  border: 1px dashed var(--border-light, rgba(17, 24, 39, 0.16));
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-tertiary, #9ca3af);
}
.tsd-qr-zoom-tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
}

/* 名称 / 资源地址 / 提取码 */
.tsd-meta {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-light, rgba(17, 24, 39, 0.12));
  text-align: left;
}
.tsd-meta-name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #111827);
  line-height: 1.5;
  word-break: break-word;
}
.tsd-meta-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  width: 100%;
  font-size: 12px;
  color: var(--text-tertiary, #6b7280);
}
.tsd-meta-label {
  flex-shrink: 0;
}
.tsd-meta-link {
  flex: 1;
  min-width: 0;
  color: var(--primary, #0f766e);
  word-break: break-all;
}
/* 手机端地址是真外链（点了就跳），桌面端只是文本 */
a.tsd-meta-link {
  text-decoration: none;
}
a.tsd-meta-link:active,
a.tsd-meta-link:hover {
  text-decoration: underline;
}
.tsd-meta-code {
  flex: 1;
  min-width: 0;
  color: var(--primary, #0f766e);
  font-weight: 700;
  letter-spacing: 1px;
}
.tsd-meta-copy {
  flex-shrink: 0;
  padding: 2px 8px;
  border: none;
  border-radius: 6px;
  background: var(--bg-hover, rgba(17, 24, 39, 0.06));
  color: var(--text-secondary, #4b5563);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}
.tsd-meta-copy:hover {
  color: var(--primary, #0f766e);
}

/* 全屏放大：PC 上用户拿手机扫屏幕，码越大越好识别 */
.tsd-zoom {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  background: rgba(15, 23, 42, 0.92);
  cursor: zoom-out;
  animation: tsd-fade 0.16s ease;
}
.tsd-zoom img {
  width: min(78vw, 78vh);
  height: min(78vw, 78vh);
  background: #fff;
  border-radius: 12px;
}
.tsd-zoom-tip {
  margin: 0;
  font-size: 14px;
  color: #e5e7eb;
}

@keyframes tsd-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes tsd-rise {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 减少动画模式 */
@media (prefers-reduced-motion: reduce) {
  .tsd-mask,
  .tsd-modal,
  .tsd-spin {
    animation: none;
  }
}
</style>
