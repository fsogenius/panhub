<template>
  <section v-if="items.length > 0" class="curated-section">
    <!-- 极轻的区块标识（3px 主色渐变竖条 + 13px 灰字），只占约 20px 高。
         完全裸着会让人以为这是搜索结果漏出来的 -->
    <div class="curated-head">
      <span class="curated-head__bar" aria-hidden="true" />
      <h2 class="curated-head__text">精选资源</h2>
    </div>

    <div class="curated-list">
      <a
        v-for="item in items"
        :key="item.id"
        class="curated-item"
        :href="item.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          class="curated-item__icon"
          :src="platformIcon(item.platform)"
          :alt="platformName(item.platform)"
          :title="platformName(item.platform)"
          width="18"
          height="18"
          loading="lazy"
        />

        <span class="curated-item__body">
          <span class="curated-item__name">{{ item.name }}</span>
          <span v-if="item.note" class="curated-item__note">{{ item.note }}</span>
        </span>

        <!-- 整行都是链接（点哪都能进），箭头足够当引导；「去保存」文案
             只在 hover / 触摸设备上出现，避免十几条重复同一句话 -->
        <span class="curated-item__go">
          <span class="curated-item__go-text">去保存</span>
          <span aria-hidden="true">→</span>
        </span>
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { PLATFORM_INFO } from "../config/platforms";
import { API_BASE } from "../config";

/**
 * 网盘资源精选（对齐官方站 2026-09-22）
 *
 * 首页 "不需要搜索就能拿到东西" 的确定性入口：官方站后台「资源精选」维护一批
 * 固定资源（网盘分享链接 + 名称 + 备注），首页列出来，点开即跳分享页由用户
 * 自己保存到网盘。
 *
 * 为什么是**清单**而不是卡片网格：
 *   一行就是一条资源，扫读顺序天然从上到下，也不再有"名称被截断"的问题。
 *
 * 与搜索结果的区别（有意为之）：
 *   - 这里**不做转存**，直接给原始分享链接 —— 这批资源是官方站自己挑的，
 *     价值在于"确定能拿到"；
 *   - 因此不挂 tid、不走 /api/transfer，整行就是一个普通外链（中键/新标签页都可）。
 *
 * 数据：GET /api/curated-resources（盘型由服务端解析好；响应里还带 password 字段，
 * 但**这里刻意不渲染"提取码：xxxx"**—— 提取码已经拼在链接的 `?pwd=` 上，
 * 点开网页端会自动填码，再单独写一行属于冗余信息）。
 *
 * 空配置整块不渲染，且**刻意不做骨架屏**：空配置是常态，骨架闪一下再消失比
 * "晚一点出现"更像页面出错，还会带动下方布局跳一下。
 */
interface CuratedItem {
  id: string;
  name: string;
  url: string;
  note?: string;
  platform: string;
  /** 服务端解析出的提取码；已拼在链接上，界面不展示（见文件头注释） */
  password?: string;
}

interface CuratedResponse {
  code: number;
  message: string;
  data?: { items?: CuratedItem[]; updatedAt?: number };
}

const items = ref<CuratedItem[]>([]);

const platformIcon = (t: string): string => PLATFORM_INFO[t]?.icon || PLATFORM_INFO.others.icon;
const platformName = (t: string): string => PLATFORM_INFO[t]?.name || PLATFORM_INFO.others.name;

async function fetchItems() {
  try {
    const res = await fetch(`${API_BASE}/curated-resources`);
    const data: CuratedResponse = await res.json();
    const list = data?.code === 0 ? data.data?.items : [];
    items.value = Array.isArray(list)
      ? list.filter((it) => it && typeof it.url === "string" && it.url)
      : [];
  } catch {
    items.value = [];
  }
}

onMounted(fetchItems);
</script>

<style scoped>
.curated-section {
  width: 100%;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  animation: fadeIn 0.5s ease;
}

/* 极轻的区块标识。左内边距与条目的内边距对齐（10px，移动端 8px），
   这样竖条和第一条资源的图标在同一条竖直线上 */
.curated-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  margin-bottom: 6px;
}

.curated-head__bar {
  flex: none;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--primary) 0%, var(--secondary) 100%);
}

.curated-head__text {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}

/* 去掉每条底色，靠行距分隔；无底色后文字成为主角，hover 才给一层淡底。
   宽屏两列用 CSS 多列（columns）而不是 grid：多列是逐列堆叠，两条互不牵连高度 */
.curated-list {
  columns: 1;
  column-gap: 20px;
}

@media (min-width: 900px) {
  .curated-list {
    columns: 2;
  }
}

.curated-item {
  /* 防止一条资源被拆到两列（多列布局默认允许拆行） */
  break-inside: avoid;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  text-decoration: none;
  background: transparent;
  transition: background-color var(--transition-fast);
}

.curated-item:hover {
  background: var(--bg-secondary);
}

/* 18px 图标与首行文字垂直居中：首行行框 = 15.5 × 1.45 ≈ 22.5px，
   (22.5 - 18) / 2 ≈ 2.2 → margin-top 2px（改名称字号/行高时这个数要跟着算） */
.curated-item__icon {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 4px;
  object-fit: contain;
}

.curated-item__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* 名称 15.5px/700：600 不在实际加载的字重里（400/500/700/800），是浏览器
   合成的假粗体，700 才是真字重 */
.curated-item__name {
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text-primary);
  word-break: break-word;
}

/* 备注与名称的灰度/字号再拉开一档：让"名称"先被看到，"说明"退到第二眼 */
.curated-item__note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-tertiary);
  /* 备注是补充信息，最多两行，避免个别长文案把清单拉得参差 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

/* 箭头常驻（整行可点，箭头就是引导），文案默认不显示 */
.curated-item__go {
  flex: none;
  margin-left: auto;
  padding-top: 1px;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  transition: color var(--transition-fast);
}

.curated-item:hover .curated-item__go {
  color: var(--primary);
}

/* 指针设备 hover 才出「去保存」文案（十几条重复同一句是纯噪声），
   触摸设备没有 hover，文案常驻。
   ⚠️ 显隐必须用 visibility/opacity，不能用 display:none：那块宽度若是 hover 才
   出现，标题可用宽度会跟着变、可能多折一行；而多列布局是按高度均衡分配的，行高一变
   整列就重新分配 → 鼠标下的条目跳到另一列 → hover 丢失 → 又缩回去，表现为反复闪烁。
   占位不动就不会触发重排。 */
.curated-item__go-text {
  visibility: hidden;
  opacity: 0;
  margin-right: 3px;
  transition: opacity var(--transition-fast);
}

@media (hover: hover) and (pointer: fine) {
  .curated-item:hover .curated-item__go-text {
    visibility: visible;
    opacity: 1;
  }
}

@media (hover: none) {
  .curated-item__go-text {
    visibility: visible;
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .curated-section {
    padding: 8px;
  }

  .curated-head {
    padding: 0 8px;
  }

  .curated-item {
    padding: 9px 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .curated-section {
    animation: none;
  }
}
</style>
