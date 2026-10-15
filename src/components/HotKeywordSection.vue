<template>
  <div v-if="loading || keywords.length > 0" class="hot-keyword-section">
    <!-- 骨架：只在等接口的那一小会儿出现，避免区块从"无"到"有"的跳动 -->
    <div v-if="loading" class="keyword-list" aria-hidden="true">
      <span v-for="i in SKELETON_COUNT" :key="i" class="keyword-chip keyword-chip--skeleton" />
    </div>

    <div v-else class="keyword-list">
      <button
        v-for="kw in keywords"
        :key="kw"
        type="button"
        class="keyword-chip"
        :aria-label="`搜索 ${kw}`"
        @click="props.onSearch(kw)"
      >
        {{ kw }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useHotKeywords } from "../composables/useHotKeywords";

interface Props {
  onSearch: (term: string) => void;
}

const props = defineProps<Props>();

/** 骨架占位数量（与常见词表长度对齐即可，纯视觉） */
const SKELETON_COUNT = 12;

/**
 * 词表来自官方站后台「热门关键词」配置：
 *   GET /api/hot-keywords（公开端点，静态前台可直接复用）。
 *
 * 拉取逻辑在 `composables/useHotKeywords.ts`（模块级单例），
 * 与首页「搜索无结果」空状态的推荐词 chip 共用同一份数据——两处只发一次请求。
 *
 * 拉取失败/词表为空 → 整个区块不渲染（首页不该因为一个装饰性区块报错）。
 */
const { keywords, loading, ensureLoaded } = useHotKeywords();

onMounted(ensureLoaded);
</script>

<style scoped>
.hot-keyword-section {
  width: 100%;
  padding: 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  animation: fadeIn 0.5s ease;
}

/**
 * 等宽网格：列宽恒定、每行左右齐平（1fr 把轨道撑满容器）；
 * 最后一行不满时也只是按列留白，看起来是有规律的网格而不是"随机空一截"。
 *
 * - minmax 下限取 72px：与 2 字 chip 同宽；
 * - 必须是 auto-fill 不是 auto-fit：auto-fit 会把空轨道塌缩，导致最后一行
 *   个别词各拉成半屏宽（更丑）；
 * - chip 去掉左右内边距改由轨道控宽，文字居中。
 */
.keyword-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 12px;
}

.keyword-chip {
  padding: 10px 0;
  text-align: center;
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast),
    color var(--transition-fast), transform var(--transition-fast),
    box-shadow var(--transition-fast);
}

.keyword-chip:hover {
  color: var(--primary);
  background: var(--bg-active);
  border-color: rgba(15, 118, 110, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(15, 118, 110, 0.12);
}

.keyword-chip:active {
  transform: translateY(0);
}

.keyword-chip--skeleton {
  width: 100%;
  height: 38px;
  border-radius: var(--radius-sm);
  background: var(--bg-skeleton, #f0f0f0);
  cursor: default;
  animation: keyword-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes keyword-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (max-width: 640px) {
  .hot-keyword-section {
    padding: 14px;
  }

  .keyword-list {
    /* 移动端：字号降到 13px，轨道下限收到 60px 以保持列数与桌面端同量级 */
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
    gap: 8px;
  }

  .keyword-chip {
    padding: 8px 0;
    font-size: 13px;
  }

  .keyword-chip--skeleton {
    width: 100%;
    height: 32px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hot-keyword-section {
    animation: none;
  }

  .keyword-chip:hover {
    transform: none;
  }

  .keyword-chip--skeleton {
    animation: none;
  }
}
</style>
