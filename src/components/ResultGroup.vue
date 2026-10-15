<template>
  <div class="result-card">
    <div class="card-header">
      <div class="platform-badge" :style="{ background: color }">
        <img class="platform-icon" :src="icon" :alt="title" loading="lazy" />
      </div>
      <div class="header-info">
        <h3 class="platform-title">{{ title }}</h3>
        <span class="resource-count">{{ items.length }} 个资源</span>
      </div>
      <button
        v-if="canToggleCollapse && !expanded && items.length > initialVisible"
        class="expand-btn"
        @click="$emit('toggle')">
        展开
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"></path>
        </svg>
      </button>
    </div>

    <ul class="resource-list">
      <li v-for="r in visibleItems" :key="r.tid || r.url" class="resource-item">
        <div class="resource-content">
          <!-- 所有条目统一渲染为可点击文本——点标题即「获取」，不再暴露 <a href> 直链。
               此前仅已接入转存的盘型剥离了 url，其余盘型仍是外链，用户点标题直接跳转
               原分享链接，绕过「获取」流程。统一后无任何直跳路径。 -->
          <span
            class="resource-link"
            :class="{ 'resource-link--suspect': linkStatus(r) === 'bad' }"
            :title="linkStatus(r) === 'bad' ? '该资源疑似失效，仍可点击尝试' : '点击立即获取'"
            @click="handleGet(r)">
            <span class="link-text">{{ r.note || "网盘资源" }}</span>
          </span>

          <div class="resource-meta">
            <div class="meta-tags">
              <span class="meta-tag date">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                {{ formatDate(r.datetime) || "时间未知" }}
              </span>

              <span v-if="r.password" class="meta-tag password">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <circle cx="12" cy="16" r="1"></circle>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                提取码: {{ r.password }}
              </span>

              <!-- 服务端探活结果角标（异步懒查，不阻塞渲染） -->
              <span v-if="linkStatus(r) === 'bad'" class="meta-tag suspect">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                疑似失效
              </span>
            </div>

            <button
              class="transfer-btn"
              :class="{
                'transfer-btn--loading': getStatus(r) === 'loading',
                'transfer-btn--dead': getStatus(r) === 'dead',
                'transfer-btn--suspect':
                  linkStatus(r) === 'bad' && getStatus(r) === 'idle',
                'transfer-btn--done': getStatus(r) === 'done',
              }"
              :disabled="isTransferBtnDisabled(r)"
              :title="btnTitle(r)"
              @click.prevent="handleGet(r)">
              <svg v-if="getStatus(r) === 'loading'" class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3v12"></path>
                <path d="M7 10l5 5 5-5"></path>
                <path d="M5 21h14"></path>
              </svg>
              {{ transferBtnLabel(r) }}
            </button>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="!expanded && items.length > initialVisible" class="card-footer">
      <button class="load-more-btn" @click="$emit('toggle')">
        显示更多 ({{ items.length - initialVisible }})
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12l7 7 7-7"></path>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useTransfer } from "../composables/useTransfer";
import { useLinkCheck } from "../composables/useLinkCheck";
import type { MergedLink } from "../types";

const props = defineProps<{
  title: string;
  color: string;
  icon: string;
  items: MergedLink[];
  expanded: boolean;
  initialVisible: number;
  /** 是否在卡片头部显示「展开」（默认由底部按钮承担） */
  canToggleCollapse?: boolean;
}>();

defineEmits(["toggle"]);

// 「获取」：状态与请求都在 useTransfer 单例里，同一资源在多个卡片/分组间共享状态，
// 避免重复请求；无 tid 的条目（正版合规源等）同样走后端，由服务端交付并计费
const { statusOf: transferStatus, requestTransfer, anyBusy: transferBusy } = useTransfer();

// 链接有效性检测（服务端探活，异步懒查当前可见链接）。
// 必须声明在 isTransferBtnDisabled / handleGet 之前：两者在渲染期都会读探活结果，
// 提前声明可规避 TDZ。
const { enqueue, statusOf } = useLinkCheck();

function linkStatus(r: MergedLink) {
  // 直链已全量剥离（含非五盘），探活按 tid 上报与索引；
  // 没有 tid 的旧数据（浏览器缓存的旧响应）回落 url 键
  return statusOf(r.tid || r.url)?.status;
}

function getStatus(r: MergedLink) {
  return transferStatus(r.tid || r.url);
}

/**
 * 禁用条件：
 * - 服务端确认失效（transfer 返回 dead）→ 禁用。这是**权威结论**，不是猜测。
 * - 探活判 bad **不再禁用**：探活只是「可能失效」的猜测，拦下来的代价是用户
 *   彻底失去这个资源（页面已无任何直链出口，他连自己试一下都做不到），而放开
 *   的代价只是「点一下、拿到一句失效提示」——成本算反了。误判也确有前科
 *   （16% 判活的链接一碰就死；还修过 locked 大面积误报）。所以改为弱提示 +
 *   可点，让真实转存去给结论：真死会在点后置 dead（自动收敛成权威禁用），
 *   误判则当场被纠正。
 * - 自身 loading，或全局有其它「获取」在跑（done 本地复制除外）。
 *   探活是异步懒查、只查当前可见项，结果回来前按钮本就可点（固有竞态）。
 */
function isTransferBtnDisabled(r: MergedLink): boolean {
  const st = getStatus(r);
  return st === "loading" || st === "dead" || (transferBusy.value && st !== "done");
}

/** 按钮文案：默认动作统一叫「立即获取」（与小程序端一致，不区分盘型） */
function transferBtnLabel(r: MergedLink): string {
  const st = getStatus(r);
  if (st === "loading") return "获取中…";
  if (st === "done") return "已获取";
  if (st === "dead") return "已失效";
  // 疑似失效：文案保留"可以点"的语义，不用「已失效」这种结论式措辞
  if (linkStatus(r) === "bad") return "仍要试试";
  return transferBusy.value ? "排队中…" : "立即获取";
}

function btnTitle(r: MergedLink): string {
  if (getStatus(r) === "dead") return "该资源已失效，无法获取";
  const st = getStatus(r);
  if (st === "done") return "点击查看并复制获取的内容";
  if (st === "loading") return "正在获取";
  if (transferBusy.value) return "正在获取其他资源，请稍候";
  if (linkStatus(r) === "bad") return "系统探测该资源可能已失效，仍可点击尝试获取";
  return "立即获取资源";
}

async function handleGet(r: MergedLink) {
  // 所有条目统一可点，点标题与点「获取」按钮走同一入口。
  // 疑似失效（探活 bad）不再拦——它只是猜测，交给 requestTransfer 用真实转存
  // 确认；已确认失效（dead）由 useTransfer 内部兜底提示，不发请求。
  await requestTransfer({ tid: r.tid, url: r.url, name: r.note });
}

// 注意：visibleItems 必须先于下方 watch 声明——watch({ immediate: true }) 会在
// setup 执行到 watch 行时立即求值 getter，若声明在后会触发 TDZ。
const visibleItems = computed(() =>
  props.expanded ? props.items : props.items.slice(0, props.initialVisible)
);

// 只探活「当前可见」的条目：展开更多时自动补探，避免一次性把整页几百条打给后端
watch(
  () => visibleItems.value,
  (items) => {
    if (!items || items.length === 0) return;
    enqueue(
      items
        .filter((r) => r.tid || (typeof r.url === "string" && r.url))
        .map((r) => ({
          tid: typeof r.tid === "string" ? r.tid : "",
          url: typeof r.url === "string" ? r.url : "",
          password: typeof r.password === "string" ? r.password : "",
        }))
    );
  },
  { immediate: true }
);

function formatDate(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}
</script>

<style scoped>
.result-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  box-shadow: 0 8px 22px rgba(17, 24, 39, 0.06);
  overflow: hidden;
  transition: box-shadow var(--transition-normal), transform var(--transition-normal);
}
.result-card:hover {
  box-shadow: 0 14px 28px rgba(17, 24, 39, 0.1);
  transform: translateY(-3px);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-surface-elevated);
  border-bottom: 1px solid var(--border-light);
  position: relative;
}
.card-header::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 16px;
  right: 16px;
  height: 1px;
  background: linear-gradient(90deg, var(--primary), transparent 70%);
  opacity: 0.25;
}

.platform-badge {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 5px 10px rgba(17, 24, 39, 0.2);
  flex-shrink: 0;
}
.platform-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

.header-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.platform-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.2;
}
.resource-count {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.resource-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.resource-item {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  transition: background var(--transition-fast);
}
.resource-item:last-child {
  border-bottom: none;
}
.resource-item:hover {
  background: var(--bg-hover);
}
.resource-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.resource-link {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--primary);
  font-weight: 600;
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
  overflow-wrap: anywhere;
  transition: color var(--transition-fast), gap var(--transition-fast);
}
.resource-link:hover {
  color: var(--primary-dark);
  gap: 8px;
}
.link-text {
  flex: 1;
  min-width: 0;
}
.external-icon {
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  flex-shrink: 0;
  stroke: currentColor;
}
.resource-link:hover .external-icon {
  opacity: 1;
  transform: translateX(0);
}

.resource-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}
.meta-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}
.meta-tag svg {
  stroke: currentColor;
  opacity: 0.7;
}
.meta-tag.date {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.15);
  color: var(--primary);
}
.meta-tag.password {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.2);
  color: var(--success);
}
/* 统一为可点文本入口后，标题即「获取」按钮 */
.resource-link {
  cursor: pointer;
}

/* 头部展开（可选，由 canToggleCollapse 控制） */
.expand-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast),
    color var(--transition-fast), transform var(--transition-fast);
}
.expand-btn:hover {
  background: var(--bg-secondary);
  border-color: var(--border-medium);
  color: var(--text-primary);
  transform: translateY(-1px);
}
.expand-btn svg {
  stroke: currentColor;
}

/* 疑似失效角标（琥珀=提示，不是结论）。
   原为红色「已失效」，探活降级为弱提示后一并换色降调——
   红色是"确定坏了"的语义，而这里我们只知道"可能坏了"。 */
.meta-tag.suspect {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.28);
  color: #b45309;
}

/* 疑似失效链接：保留删除线做提示，但**可点**（点击=获取）。
   与服务端确认失效的 .transfer-btn--dead 区分：那一档是权威结论，仍硬拦。 */
.resource-link--suspect {
  text-decoration: line-through;
  text-decoration-color: rgba(239, 68, 68, 0.5);
  text-decoration-thickness: 1.5px;
  color: var(--text-secondary);
  cursor: pointer;
}
/* 可点的手势要有可点的反馈：hover 回到 primary，不再是"灰着不动" */
.resource-link--suspect:hover {
  color: var(--primary-dark);
}

.transfer-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  color: var(--primary);
  border: 1px solid rgba(15, 118, 110, 0.35);
  background: rgba(15, 118, 110, 0.06);
  transition: background-color var(--transition-fast), border-color var(--transition-fast),
    color var(--transition-fast), transform var(--transition-fast);
}
.transfer-btn:hover:not(:disabled) {
  background: rgba(15, 118, 110, 0.12);
  border-color: var(--primary);
  transform: translateY(-1px);
}
.transfer-btn:disabled {
  cursor: not-allowed;
}
.transfer-btn svg {
  stroke: currentColor;
}
.transfer-btn--loading {
  opacity: 0.7;
  cursor: wait;
}
.transfer-btn--done {
  color: var(--success);
  border-color: var(--success);
  background: rgba(16, 185, 129, 0.08);
}
.transfer-btn--dead {
  color: #999;
  border-color: var(--border-light);
  background: transparent;
  text-decoration: line-through;
  text-decoration-color: #ccc;
}
.transfer-btn--dead:hover:not(:disabled) {
  background: transparent;
  border-color: var(--border-light);
  color: #999;
  transform: none;
}

/* 疑似失效态：与 dead 的关键差别是**可点**——
   只把颜色压暗做提示，不加删除线、不改 not-allowed，hover 仍有正常反馈。 */
.transfer-btn--suspect {
  color: var(--text-secondary);
  border-color: var(--border-medium);
  background: transparent;
}
.transfer-btn--suspect:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
  background: rgba(15, 118, 110, 0.1);
}

.spin {
  animation: transfer-spin 0.8s linear infinite;
}
@keyframes transfer-spin {
  to {
    transform: rotate(360deg);
  }
}

.card-footer {
  padding: 12px 16px;
  background: var(--bg-surface-subtle);
  border-top: 1px solid var(--border-light);
  text-align: center;
}
.load-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--primary), #14b8a6);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.3);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.load-more-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(15, 118, 110, 0.4);
}
.load-more-btn svg {
  stroke: currentColor;
}

@media (max-width: 640px) {
  .card-header {
    padding: 12px;
    gap: 10px;
  }
  .platform-badge {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }
  .platform-title {
    font-size: 15px;
  }
  .resource-item {
    padding: 12px;
  }
  .resource-link {
    font-size: 13px;
  }
  .meta-tag {
    padding: 3px 6px;
    font-size: 10px;
  }
  .transfer-btn {
    padding: 5px 8px;
    font-size: 11px;
  }
}
</style>
