<template>
  <section class="search">
    <div class="search-box" :class="{ focused: isFocused, loading }">
      <!-- 类别下拉：只搜该网盘的频道，搜前缩小范围提速 -->
      <div ref="catWrapRef" class="cat-select-wrap" @click.self="catOpen = !catOpen">
        <button
          type="button"
          class="cat-trigger"
          :class="{ open: catOpen }"
          aria-haspopup="listbox"
          :aria-expanded="catOpen"
          aria-label="按网盘类别搜索"
          @click="catOpen = !catOpen">
          {{ catLabel(cat) || "全部网盘" }}
          <svg class="cat-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </button>
        <div v-if="catOpen" class="cat-menu" role="listbox">
          <button
            type="button"
            role="option"
            :aria-selected="!cat"
            :class="['cat-option', { active: !cat }]"
            @click="pickCat('')">
            全部网盘
          </button>
          <button
            v-for="c in SEARCH_CATS"
            :key="c.value"
            type="button"
            role="option"
            :aria-selected="cat === c.value"
            :class="['cat-option', { active: cat === c.value }]"
            @click="pickCat(c.value)">
            {{ c.label }}
          </button>
        </div>
      </div>
      <div class="cat-divider" aria-hidden="true"></div>

      <input
        ref="inputEl"
        :value="modelValue"
        :placeholder="placeholder"
        name="kw"
        aria-label="搜索关键词"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        class="search-input"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @keyup.enter="handleSearch" />

      <div class="search-actions">
        <button
          v-if="searched"
          class="action-btn reset"
          type="button"
          aria-label="重置搜索"
          title="重置搜索"
          @click="$emit('update:modelValue', ''); $emit('reset')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
          </svg>
          <span class="btn-text">重置</span>
        </button>

        <button
          v-else-if="modelValue && !loading"
          class="action-btn ghost"
          type="button"
          aria-label="清空关键词"
          title="清空"
          @click="$emit('update:modelValue', ''); $emit('reset')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <button
          v-if="loading && !paused"
          class="action-btn pause"
          type="button"
          aria-label="暂停搜索"
          title="暂停搜索"
          @click="$emit('pause')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="4" width="4" height="16" rx="1"></rect>
            <rect x="14" y="4" width="4" height="16" rx="1"></rect>
          </svg>
          <span class="btn-text">暂停</span>
        </button>

        <button
          v-if="loading && paused"
          class="action-btn resume"
          type="button"
          aria-label="继续搜索"
          title="继续搜索"
          @click="$emit('continue')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 3l14 9-14 9V3z"></path>
          </svg>
          <span class="btn-text">继续</span>
        </button>

        <div v-if="loading && !paused" class="loading-spinner"></div>

        <button
          v-else-if="!loading"
          class="action-btn primary"
          type="button"
          :disabled="!modelValue"
          aria-label="开始搜索"
          @click="handleSearch">
          <span class="btn-text">搜索</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"></path>
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { SEARCH_CATS } from "../config/platforms";

const props = defineProps<{
  modelValue: string;
  loading: boolean;
  paused: boolean;
  placeholder: string;
  searched: boolean;
  /** 当前选中类别（空 = 全部网盘） */
  cat?: string;
}>();

const emit = defineEmits([
  "update:modelValue",
  "update:cat",
  "search",
  "reset",
  "pause",
  "continue",
]);

const catLabel = (value?: string) =>
  SEARCH_CATS.find((c) => c.value === value)?.label ?? "";

const isFocused = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

const catOpen = ref(false);
const catWrapRef = ref<HTMLElement | null>(null);

function pickCat(c: string) {
  emit("update:cat", c);
  catOpen.value = false;
}

function onDocClick(e: MouseEvent) {
  if (catOpen.value && catWrapRef.value && !catWrapRef.value.contains(e.target as Node)) {
    catOpen.value = false;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && catOpen.value) catOpen.value = false;
  // Cmd/Ctrl + K 聚焦搜索框
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    inputEl.value?.focus();
    inputEl.value?.select();
  }
}

function handleSearch() {
  // iOS Safari：先收起键盘再触发搜索
  if (document.activeElement instanceof HTMLInputElement) {
    document.activeElement.blur();
  }
  setTimeout(() => emit("search"), 50);
}

onMounted(() => {
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKeyDown);
  // 仅桌面端自动聚焦，避免移动端抢焦点弹键盘
  if (window.matchMedia("(pointer: fine)").matches) {
    requestAnimationFrame(() => setTimeout(() => inputEl.value?.focus(), 100));
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKeyDown);
});
</script>

<style scoped>
.search {
  width: 100%;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 12px;
  --sb-pad-y: 12px;
  --sb-pad-x: 16px;
  --sb-gap: 12px;
  padding: var(--sb-pad-y) var(--sb-pad-x);
  background: var(--bg-glass);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--border-medium);
  border-radius: 18px;
  box-shadow: var(--shadow-lg);
  transition: border-color var(--transition-normal), box-shadow var(--transition-normal),
    transform var(--transition-normal);
  position: relative;
  z-index: 70;
}

.search-box.focused {
  border-color: var(--primary);
  box-shadow: 0 10px 26px rgba(15, 118, 110, 0.14);
  transform: translateY(-2px);
}

.search-box.loading {
  border-color: var(--primary);
  animation: searchPulse 2.2s ease-in-out infinite;
}

@keyframes searchPulse {
  0%,
  100% {
    box-shadow: 0 8px 32px rgba(15, 118, 110, 0.22);
  }
  50% {
    box-shadow: 0 8px 40px rgba(15, 118, 110, 0.34);
  }
}

/* 类别下拉 */
.cat-select-wrap {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  align-self: stretch;
  margin: calc(-1 * var(--sb-pad-y)) calc(-1 * var(--sb-gap)) calc(-1 * var(--sb-pad-y))
    calc(-1 * var(--sb-pad-x));
  padding: var(--sb-pad-y) var(--sb-pad-x);
  border-radius: 17px 0 0 17px;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}
.cat-select-wrap:hover {
  background: var(--bg-active);
}
.cat-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 88px;
  padding: 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  outline: none;
  white-space: nowrap;
}
.cat-trigger.open {
  color: var(--primary);
}
.cat-chevron {
  flex-shrink: 0;
  color: var(--text-tertiary);
  transition: transform var(--transition-fast);
}
.cat-trigger.open .cat-chevron {
  transform: rotate(180deg);
  color: var(--primary);
}
.cat-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 60;
  width: 100%;
  max-height: min(62vh, 480px);
  overflow-y: auto;
  padding: 6px 0;
  background: var(--bg-glass-strong);
  border: 1px solid var(--border-medium);
  border-radius: 14px;
  box-shadow: var(--shadow-xl);
  animation: cat-pop-in 0.14s ease;
  transform-origin: top left;
}
@keyframes cat-pop-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.cat-option {
  display: block;
  width: 100%;
  padding: 9px 14px;
  font-size: 14px;
  text-align: left;
  color: var(--text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}
.cat-option:hover {
  background: var(--bg-hover);
}
.cat-option.active {
  color: var(--primary);
  font-weight: 600;
  background: var(--bg-active);
}
.cat-divider {
  width: 1px;
  align-self: stretch;
  margin: 4px 0;
  background: var(--border-light);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 0;
  -webkit-appearance: none;
  -webkit-border-radius: 0;
  border-radius: 0;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}
.search-input::placeholder {
  color: var(--text-tertiary);
  font-weight: 400;
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  -webkit-appearance: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  transition: background-color var(--transition-fast), color var(--transition-fast),
    border-color var(--transition-fast), transform var(--transition-fast),
    box-shadow var(--transition-fast);
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
.action-btn svg {
  stroke: currentColor;
  flex-shrink: 0;
}

.action-btn.primary {
  background: linear-gradient(135deg, var(--primary), #14b8a6);
  color: white;
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.3);
}
.action-btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.36);
}

.action-btn.ghost {
  background: var(--bg-input);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  padding: 8px;
}
.action-btn.ghost:hover {
  background: var(--bg-primary);
  border-color: var(--border-medium);
  color: var(--text-primary);
}

.action-btn.pause {
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: white;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}
.action-btn.pause:hover:not(:disabled) {
  transform: translateY(-1px);
}

.action-btn.resume {
  background: linear-gradient(135deg, #10b981, #34d399);
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}
.action-btn.resume:hover:not(:disabled) {
  transform: translateY(-1px);
}

.action-btn.reset {
  background: linear-gradient(135deg, #ef4444, #f87171);
  color: white;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}
.action-btn.reset:hover:not(:disabled) {
  transform: translateY(-1px);
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(99, 102, 241, 0.2);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .search-box {
    --sb-pad-y: 10px;
    --sb-pad-x: 12px;
    --sb-gap: 8px;
    gap: var(--sb-gap);
  }
  .search-input {
    font-size: 15px;
  }
  .search-actions {
    gap: 6px;
  }
  .action-btn {
    padding: 8px 10px;
    font-size: 13px;
  }
  .action-btn.primary .btn-text,
  .action-btn.pause .btn-text,
  .action-btn.resume .btn-text,
  .action-btn.reset .btn-text {
    display: none;
  }
  .action-btn.ghost,
  .action-btn.pause,
  .action-btn.resume,
  .action-btn.reset {
    padding: 8px;
  }
  .cat-trigger {
    width: 76px;
    font-size: 13px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .search-box,
  .action-btn {
    transition: none;
  }
  .search-box.loading,
  .loading-spinner {
    animation: none;
  }
}
</style>
