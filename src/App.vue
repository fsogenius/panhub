<template>
  <div class="layout">
    <!-- 背景装饰光斑（纯径向渐变，滚动零重绘） -->
    <div class="bg-decoration" aria-hidden="true">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>
    </div>

    <!--
      顶部导航：外部 Web Component（站点导航 + 头像登录）。
      登录态与本页共用同一个 wx-auth 单例，登录成功会同步到 isVerified，
      因此搜索前的认证校验不会重复弹窗。
    -->
    <site-navbar></site-navbar>

    <!-- 公告条 -->
    <div v-if="announcementVisible" class="announce-bar" role="status">
      <span class="announce-bar__icon" aria-hidden="true">📢</span>
      <div ref="viewportEl" class="announce-bar__viewport">
        <span :key="announcementIndex" class="announce-bar__slide">
          <span
            ref="textEl"
            class="announce-bar__text"
            :class="{ 'announce-bar__text--scrolling': scrollDistance > 0 }"
            :style="scrollStyle">
            <a
              v-if="currentAnnouncement?.link"
              :href="currentAnnouncement.link"
              target="_blank"
              rel="noopener">{{ currentAnnouncement.text }}</a>
            <template v-else>{{ currentAnnouncement?.text }}</template>
          </span>
        </span>
      </div>
      <button class="announce-bar__close" type="button" aria-label="关闭公告" title="关闭" @click="dismissAnnouncement">✕</button>
    </div>

    <main class="main">
      <!-- 品牌区（对齐官方站 2026-09-22 三改）：居中一行「logo + 站名」，
           下面一句描述，无卡片、无渐变底。搜索站的首屏只需要回答"这是谁、干什么"，
           剩下的交给下面的搜索框 -->
      <header class="hero">
        <div class="hero-lockup">
          <img
            class="hero-logo"
            :src="LOGO_URL"
            alt=""
            width="48"
            height="48"
            aria-hidden="true" />
          <h1 class="hero-brand">PanHub 网盘搜索</h1>
        </div>
        <!-- 注意 span 之间不能换行：Vue 会吃掉元素之间仅含空白的换行文本节点，
             分隔符会跟前后文字黏在一起；间距一律由 .hero-tagline__sep 的 margin 给 -->
        <p class="hero-tagline"><span>10000000+ 网盘资源免费无偿分享</span><span class="hero-tagline__sep" aria-hidden="true">·</span><span class="hero-tagline__platforms">聚合夸克、百度、迅雷、UC、移动等网盘，</span><span>坚持做最全的网盘搜索引擎</span></p>
      </header>

      <SearchBox
        v-model="kw"
        v-model:cat="searchCat"
        :loading="loading"
        :paused="paused"
        :searched="searched"
        placeholder="搜索网盘资源，支持百度云、阿里云盘、夸克网盘、115网盘、迅雷云盘、天翼云盘、123网盘、移动云盘、UC网盘等"
        @search="onSearch"
        @reset="fullReset"
        @pause="pauseSearch"
        @continue="handleContinueSearch" />

      <!-- 统计 + 平台过滤 -->
      <div v-if="searched" class="stats-bar">
        <div class="stats-main">
          <span class="stat-item">
            <span class="stat-label">结果</span>
            <span class="stat-value">{{ total }}</span>
          </span>
          <span class="stat-item">
            <span class="stat-label">用时</span>
            <span class="stat-value">{{ elapsedSeconds }}s</span>
          </span>
          <span v-if="deepLoading && !paused" class="loading-indicator">
            <span class="pulse-dot"></span>
            <span class="loading-text">持续搜索中…</span>
          </span>
          <span v-if="paused" class="paused-indicator-bar">
            <span>⏸</span>
            <span class="paused-text">
              {{ autoPausedAtLimit ? `已找到 ${total} 条结果，可继续搜索更多` : "搜索已暂停" }}
            </span>
          </span>
        </div>

        <div v-if="hasResults" class="platform-filters">
          <button
            :class="['filter-pill', { active: filterPlatform === 'all' }]"
            @click="filterPlatform = 'all'">
            全部 ({{ total }})
          </button>
          <button
            v-for="p in platforms"
            :key="p"
            :class="['filter-pill', { active: filterPlatform === p }]"
            @click="filterPlatform = p">
            {{ platformInfo(p).name }} ({{ merged[p]?.length || 0 }})
          </button>
        </div>
      </div>

      <!-- 结果区 -->
      <section
        v-if="hasResults"
        class="results-section"
        :class="{ 'results-section--refreshing': loading && !paused }">
        <div class="results-grid">
          <ResultGroup
            v-for="group in groupedResults"
            :key="group.type"
            :title="platformInfo(group.type).name"
            :color="platformInfo(group.type).color"
            :icon="platformInfo(group.type).icon"
            :items="sortedItems(group.items)"
            :expanded="filterPlatform !== 'all' || expandedSet.has(group.type)"
            :initial-visible="3"
            :can-toggle-collapse="false"
            @toggle="handleToggle(group.type)" />
        </div>
      </section>

      <!-- 骨架屏 -->
      <section v-else-if="loading || deepLoading" class="skeleton-section" aria-hidden="true">
        <div v-for="i in 2" :key="i" class="result-card skeleton-card">
          <div class="card-header">
            <span class="sk sk-circle"></span>
            <span class="sk sk-bar" style="width: 120px"></span>
          </div>
          <div class="skeleton-body">
            <span class="sk sk-bar" style="width: 72%"></span>
            <span class="sk sk-bar" style="width: 55%"></span>
            <span class="sk sk-bar" style="width: 38%"></span>
          </div>
        </div>
      </section>

      <!-- 空状态 -->
      <section v-else-if="searched && !loading && !deepLoading && !paused" class="empty-state">
        <div class="empty-card">
          <div class="empty-card__main">
            <div class="empty-icon" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
                <path d="m8.5 8.5 5 5" />
                <path d="m13.5 8.5-5 5" />
              </svg>
            </div>
            <div class="empty-card__text">
              <h3>未找到相关资源</h3>
              <p>试试其他关键词，或稍后再试</p>
            </div>
          </div>
          <div v-if="emptySuggestions.length > 0" class="empty-suggestions">
            <span class="empty-suggestions__label">试试这些：</span>
            <div class="empty-suggestions__tags">
              <button
                v-for="term in emptySuggestions"
                :key="term"
                class="empty-suggestions__tag"
                @click="quickSearch(term)">
                {{ term }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 错误提示 -->
      <section v-if="error" class="error-alert">
        <span class="error-icon">⚠️</span>
        <span>{{ error }}</span>
      </section>

      <!-- 推荐关键词快搜（对齐官方站 2026-09-22）：搜索时隐藏。
           词表由官方站后台「热门关键词」配置下发（/api/hot-keywords），
           组件挂载时拉一次 -->
      <!-- v-show 而非 v-if：v-if 搜索时会销毁组件，重置回首页后重新挂载
           （多拉一次词表、入场动画重放）；v-show 保留组件与已取到的词表 -->
      <section v-show="!searched" class="hot-keyword-wrap">
        <HotKeywordSection :on-search="quickSearch" />
      </section>

      <!-- 网盘资源精选（对齐官方站 2026-09-22）：官方站后台维护的固定资源，
           点开直接跳分享页由用户自己保存（不转存）。搜索时隐藏 -->
      <section v-show="!searched" class="curated-wrap">
        <CuratedResourceSection />
      </section>

    </main>

    <footer class="site-footer">
      <span class="footer-copy">PanHub · 聚合搜索，不存储任何文件</span>
    </footer>

    <!-- 「获取」等待/复制弹窗（含积分不足看广告、限流、回退等全部状态） -->
    <TransferStatusDialog />
    <!-- 弹窗公告：内容来自官方站后台配置（/api/notice-popup），关闭时自动不弹 -->
    <NoticeModal />
  </div>

  <!-- 全站 Toast -->
  <div v-if="toast.show" class="toast" :class="toast.type" role="status" aria-live="polite">
    {{ toast.message }}
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import SearchBox from "./components/SearchBox.vue";
import ResultGroup from "./components/ResultGroup.vue";
import TransferStatusDialog from "./components/TransferStatusDialog.vue";
import { useTransfer } from "./composables/useTransfer";
import HotKeywordSection from "./components/HotKeywordSection.vue";
import CuratedResourceSection from "./components/CuratedResourceSection.vue";
import NoticeModal from "./components/NoticeModal.vue";
import { API_BASE } from "./config";
import { useSearch } from "./composables/useSearch";
import { useAnnouncement } from "./composables/useAnnouncement";
import { useToast } from "./composables/useToast";
import { useDarkMode } from "./composables/useDarkMode";
import { useHotKeywords } from "./composables/useHotKeywords";
import { platformInfo } from "./config/platforms";
import { forceVerify } from "./api/auth";
import { orderDriverGroups } from "./utils/driverPriority";
import type { MergedLink } from "./types";

// ===== 状态 =====
const kw = ref("");
const searchCat = ref("");
const filterPlatform = ref("all");
const expandedSet = ref<Set<string>>(new Set());

const {
  loading,
  deepLoading,
  paused,
  error,
  searched,
  elapsedMs,
  total,
  merged,
  hasResults,
  autoPausedAtLimit,
  performSearch,
  continueSearch,
  pauseSearch,
  resetSearch,
} = useSearch();

// 用时展示：毫秒数是给开发看的，用户只关心「几秒」。
// 保留一位小数（如 7.5s）——整数会把 1~2 秒档位压成同一个数字，看不出差别。
const elapsedSeconds = computed(() => (elapsedMs.value / 1000).toFixed(1));

const {
  items: announcementItems,
  visible: announcementVisible,
  load: loadAnnouncement,
  dismiss: dismissAnnouncement,
} = useAnnouncement();
const { toast } = useToast();
const { init: initDarkMode } = useDarkMode();

// 推荐词表（后台固定词表，与热词区块共用一次请求）
const { keywords: hotKeywords, ensureLoaded: ensureHotKeywords } = useHotKeywords();
// 空状态推荐词：取词表前 5 个（官方站 2026-09-23 口径，替代已下线的热搜统计）
const emptySuggestions = computed(() => hotKeywords.value.slice(0, 5));

// 站点 logo（与 index.html 的 favicon 同源）
const LOGO_URL =
  "https://cdn.jsdmirror.com/gh/wu529778790/img.shenzjd.com@master/blog/imgx-20260828-151509-5bk7.svg";

const announcementIndex = ref(0);
let rotateTimer: ReturnType<typeof setInterval> | null = null;

const currentAnnouncement = computed(
  () => announcementItems.value[announcementIndex.value] ?? null
);

// 公告跑马灯：单条一行放不下时左右来回滚动（hover 暂停），能放下就静止居中。
// 是否滚动由实测宽度决定——不能只看字数，等宽字体与标点都会影响实际宽度。
const viewportEl = ref<HTMLElement | null>(null);
const textEl = ref<HTMLElement | null>(null);
const scrollDistance = ref(0); // >0 表示当前条目超宽，需要来回滚动

const scrollStyle = computed(() => {
  if (scrollDistance.value <= 0) return {};
  const duration = Math.max(6, Math.round(scrollDistance.value / 30));
  return {
    "--announce-scroll-distance": `-${scrollDistance.value}px`,
    "--announce-scroll-duration": `${duration}s`,
  };
});

/** 超宽判定：文本实际宽度超出视口可视宽度才启用左右滚动动画 */
function measureScroll() {
  const vp = viewportEl.value;
  const tx = textEl.value;
  if (!vp || !tx) {
    scrollDistance.value = 0;
    return;
  }
  const dist = Math.ceil(tx.scrollWidth - vp.clientWidth);
  scrollDistance.value = dist > 4 ? dist : 0;
}

watch(announcementIndex, () => {
  nextTick(measureScroll);
});

function onResize() {
  if (announcementVisible.value) measureScroll();
}

// ===== 搜索 =====

// 「获取」401 处理（对齐官方站 2026-09-24）：搜索对访客放开后，登录卡点收敛到
// 「获取」——401 时直接吊起 wx-auth SDK 登录弹窗（等同手动点登录），
// forceVerify 在登录成功（isVerified 置位）时返回 true，useTransfer 收到后
// 自动重试本次获取——全程无需再点一次。模块级注册：ResultGroup 等无参调用
// 触发的获取同样生效。
useTransfer(() => forceVerify());

/** 服务端 401：登录态失效 → 强制重新认证后重试 */
let authRetrying = false;
async function handleAuthRequired() {
  if (authRetrying) return;
  authRetrying = true;
  try {
    const ok = await forceVerify();
    if (ok) {
      resetSearch();
      await doSearch();
    }
  } finally {
    authRetrying = false;
  }
}

async function doSearch() {
  const keyword = kw.value.trim();
  if (!keyword || loading.value) return;
  syncUrl(keyword);
  await performSearch({
    keyword,
    cat: searchCat.value || undefined,
    onAuthRequired: handleAuthRequired,
  });
}

/** 搜索词与类别同步到 URL（可分享，刷新后自动重搜） */
function syncUrl(keyword: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("q", keyword);
  if (searchCat.value) url.searchParams.set("cat", searchCat.value);
  else url.searchParams.delete("cat");
  window.history.replaceState(null, "", url.toString());
}

async function onSearch() {
  if (!kw.value.trim()) return;
  if (paused.value) resetSearch();
  if (loading.value) return;
  // 访客准入（对齐官方站 2026-09-24）：搜索不再强制登录，登录卡点收敛到
  // 「获取」转存。匿名票据由 useSearch 在建连前自动拼在 URL 上
  //（getAnonTicketSafe，fail-open：拿不到也照发，服务端按无票访客策略放行）。
  await doSearch();
}

async function quickSearch(keyword: string) {
  kw.value = keyword;
  await onSearch();
}

async function handleContinueSearch() {
  if (!paused.value) return;
  await continueSearch({
    keyword: kw.value.trim(),
    cat: searchCat.value || undefined,
    onAuthRequired: handleAuthRequired,
  });
}

function fullReset() {
  kw.value = "";
  searchCat.value = "";
  filterPlatform.value = "all";
  expandedSet.value = new Set();
  resetSearch();
  const url = new URL(window.location.href);
  url.search = "";
  window.history.replaceState(null, "", url.toString());
}

// ===== 结果展示 =====

/**
 * 平台 pill 与分组顺序统一走 orderDriverGroups：接了转存的五家占前几位
 * （五盘之间按结果数降序），其余盘型按结果数降序。
 * SSE 推送时 merged 的 key 按首个结果到达顺序插入，次序随机，不能依赖 key 顺序。
 */
const platforms = computed(() => {
  const m = merged.value || {};
  return orderDriverGroups(
    Object.keys(m).filter((type) => (m[type]?.length ?? 0) > 0),
    (type) => m[type]?.length ?? 0
  );
});

const groupedResults = computed(() => {
  const source =
    filterPlatform.value === "all"
      ? merged.value
      : { [filterPlatform.value]: merged.value[filterPlatform.value] || [] };
  return orderDriverGroups(
    Object.keys(source).filter((type) => (source[type]?.length ?? 0) > 0),
    (type) => source[type]?.length ?? 0
  ).map((type) => ({ type, items: source[type] || [] }));
});

function handleToggle(type: string) {
  filterPlatform.value = type;
}

/** 固定按发布时间降序（流式推送时组内顺序是到达顺序） */
function sortedItems(items: MergedLink[]): MergedLink[] {
  return [...items].sort(
    (a, b) =>
      new Date(b?.datetime || "1970-01-01").getTime() -
      new Date(a?.datetime || "1970-01-01").getTime()
  );
}

// ===== 生命周期 =====

onMounted(async () => {
  // 暗色模式：跟随系统主题实时变化（首屏由 index.html 阻塞脚本即时应用）
  initDarkMode();
  // 推荐词表（热词区块 + 空状态推荐词共用）：只在挂载时拉一次
  void ensureHotKeywords();
  // 窗口尺寸变化时重新判定公告是否需要滚动
  window.addEventListener("resize", onResize);

  loadAnnouncement().then(async () => {
    if (announcementItems.value.length > 1) {
      rotateTimer = setInterval(() => {
        announcementIndex.value =
          (announcementIndex.value + 1) % announcementItems.value.length;
      }, 6000);
    }
    // 首条公告渲染完量一次宽度，决定是否需要来回滚动
    await nextTick();
    measureScroll();
  });

  // 从 URL 读取搜索词与类别，自动搜索（?q= 直访）
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  const cat = params.get("cat");
  if (cat) searchCat.value = cat;
  if (q) {
    kw.value = q;
    await onSearch();
  }
});

onBeforeUnmount(() => {
  if (rotateTimer) clearInterval(rotateTimer);
  window.removeEventListener("resize", onResize);
});
</script>

<style scoped>
/* ===== 布局骨架 ===== */
.layout {
  /* 用文档级滚动（不设 height + overflow-y）：
     内层 100vh 滚动容器会让移动端的原生惯性滚动、回弹、地址栏自动收起
     全部失效，滚动发涩。由 body 承担滚动才符合移动端预期 */
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: hidden;
}

/* 背景装饰光斑：径向渐变（不用 filter: blur，滚动零重绘开销） */
.bg-decoration {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  overflow: hidden;
}
.blob {
  position: absolute;
  border-radius: 50%;
  opacity: 0.28;
  animation: blobFloat 8s ease-in-out infinite;
}
.blob-1 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle at 40% 40%, #14b8a6 0%, #0f766e 45%, transparent 72%);
  top: -100px;
  left: -100px;
}
.blob-2 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle at 40% 40%, #fb7185 0%, #f59e0b 45%, transparent 72%);
  bottom: -50px;
  right: -50px;
  animation-delay: 2s;
}
.blob-3 {
  width: 250px;
  height: 250px;
  background: radial-gradient(circle at 40% 40%, #14b8a6 0%, #0ea5e9 45%, transparent 72%);
  top: 50%;
  left: 70%;
  animation-delay: 4s;
}
@keyframes blobFloat {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -50px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
}

/* ===== 公告条 ===== */
.announce-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
  padding: 7px 16px;
  background: linear-gradient(90deg, rgba(15, 118, 110, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%);
  border-bottom: 1px solid rgba(15, 118, 110, 0.12);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.announce-bar__viewport {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-align: center;
}
.announce-bar__slide {
  display: inline-block;
  max-width: 100%;
}
.announce-bar__slide a {
  color: var(--primary);
  text-decoration: underline;
}
.announce-bar__text {
  display: inline-block;
  white-space: nowrap;
}
.announce-bar__text a {
  color: var(--primary);
  text-decoration: underline;
}
/* 超宽来回滚动（alternate 往返）；hover 暂停方便阅读/点链接 */
.announce-bar__text--scrolling {
  animation: announceBounce var(--announce-scroll-duration, 12s) ease-in-out infinite alternate;
  will-change: transform;
}
.announce-bar__viewport:hover .announce-bar__text--scrolling {
  animation-play-state: paused;
}
@keyframes announceBounce {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(var(--announce-scroll-distance, -100px));
  }
}
.announce-bar__close {
  flex-shrink: 0;
  background: none;
  border: none;
  font-size: 14px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.announce-bar__close:hover {
  color: var(--text-secondary);
}

/* ===== 主内容 ===== */
.main {
  flex: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ===== 品牌区（对齐官方站）：居中、无卡片无底色。一行「logo + 站名」48px 高，
   下面一句描述；不加渐变底/阴影/圆角——越干净越像搜索站的首屏 ===== */
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 6px 0 0;
  text-align: center;
}

.hero-lockup {
  display: flex;
  align-items: center;
  gap: 14px;
}

/* 不写死 border-radius / object-fit:fill：logo 是 512 方形 SVG（自带圆角），
   一律等比缩放，绝不被容器拉扁 */
.hero-logo {
  display: block;
  flex: none;
  width: 48px;
  height: 48px;
  aspect-ratio: 1 / 1;
  object-fit: contain;
}

.hero-brand {
  margin: 0;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--text-primary);
}

.hero-tagline {
  margin: 0;
  /* 860px：整句约 57 字，宽屏一行放得下；窄屏自然折成两行（居中，不显突兀） */
  max-width: 860px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
}

/* 分隔符间距由 margin 给（模板里 span 之间不留换行，见模板块注释） */
.hero-tagline__sep {
  margin: 0 6px;
  opacity: 0.65;
}
/* ===== 统计栏 ===== */
.stats-bar {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stats-main {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
}
.stat-label {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 500;
}
.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}
.loading-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(15, 118, 110, 0.1);
  border-radius: var(--radius-md);
  border: 1px solid rgba(15, 118, 110, 0.2);
}
.pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--primary);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}
.loading-text {
  font-size: 13px;
  color: var(--primary);
  font-weight: 500;
}
.paused-indicator-bar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: var(--radius-md);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
  font-weight: 500;
}
.paused-text {
  font-size: 13px;
}
.platform-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.filter-pill {
  padding: 6px 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}
.filter-pill:hover {
  background: var(--bg-primary);
  border-color: var(--border-medium);
  transform: translateY(-1px);
}
.filter-pill.active {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.28);
}

/* ===== 结果区 ===== */
.results-section {
  position: relative;
}
.results-section--refreshing::before {
  content: "";
  position: absolute;
  inset: -8px;
  z-index: 5;
  background: var(--bg-primary);
  opacity: 0.55;
  border-radius: 16px;
  cursor: progress;
}
.results-section--refreshing::after {
  content: "正在搜索新内容…";
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  padding: 8px 16px;
  background: rgba(17, 24, 39, 0.85);
  color: #fff;
  font-size: 13px;
  border-radius: 999px;
  pointer-events: none;
}
.results-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

/* ===== 骨架屏 ===== */
.skeleton-section {
  display: grid;
  gap: 20px;
}
.skeleton-card {
  padding-bottom: 8px;
  pointer-events: none;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  overflow: hidden;
}
.skeleton-card .card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
}
.skeleton-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px;
}
.sk {
  display: inline-block;
  height: 14px;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-hover) 37%, var(--bg-secondary) 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.2s ease infinite;
}
.sk-circle {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  flex-shrink: 0;
}
@keyframes sk-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

/* ===== 空状态 ===== */
.empty-state {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}
.empty-card {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  padding: 40px 44px;
  box-shadow: var(--shadow-xl);
  display: flex;
  align-items: center;
  gap: 40px;
  flex-wrap: wrap;
}
.empty-card__main {
  display: flex;
  align-items: center;
  gap: 24px;
  min-width: 280px;
  flex: 1 1 320px;
}
.empty-icon {
  flex-shrink: 0;
  width: 88px;
  height: 88px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  color: var(--primary);
}
.empty-card__text h3 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
}
.empty-card__text p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}
/* 空状态右侧的热搜推荐：与左侧图标区并排，窄屏时改为上下堆叠 */
.empty-suggestions {
  flex: 1 1 320px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  border-left: 1px solid var(--border-light);
  padding-left: 40px;
}
.empty-suggestions__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
}
.empty-suggestions__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.empty-suggestions__tag {
  font-size: 14px;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.empty-suggestions__tag:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.06);
}
/* ===== 错误 ===== */
.error-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  color: var(--error);
  font-weight: 500;
}

/* ===== 页脚 ===== */
.site-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 16px 28px;
  font-size: 13px;
  color: var(--text-tertiary);
}

/* ===== Toast ===== */
.toast {
  position: fixed;
  top: 80px;
  right: 24px;
  padding: 12px 20px;
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-light);
  font-weight: 500;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 8px;
}
.toast.info {
  color: var(--primary);
  border-left: 4px solid var(--primary);
}
.toast.success {
  color: var(--success);
  border-left: 4px solid var(--success);
}
.toast.error {
  color: var(--error);
  border-left: 4px solid var(--error);
}

@media (max-width: 900px) {
  .main {
    padding: 16px;
  }
  .toast {
    right: 16px;
    left: 16px;
  }
}

@media (max-width: 640px) {
  .hero-logo {
    width: 40px;
    height: 40px;
  }
  .hero-brand {
    font-size: 24px;
  }
  .hero-tagline__platforms {
    display: none;
  }
  .stats-bar {
    padding: 12px;
  }
  .empty-card {
    padding: 24px 20px;
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
  }
  .empty-icon {
    width: 64px;
    height: 64px;
  }
  .empty-suggestions {
    width: 100%;
    border-left: none;
    padding-left: 0;
    padding-top: 16px;
    border-top: 1px solid var(--border-light);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse-dot,
  .sk {
    animation: none;
  }
}
</style>
