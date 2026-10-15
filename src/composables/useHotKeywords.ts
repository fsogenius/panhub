/**
 * 后台「热门关键词」词表（对齐官方站 2026-09-23）
 *
 * 用途（两处共用本单例，只发一次 GET /api/hot-keywords）：
 *  1. 首页下方「推荐关键词快搜」区块（`components/HotKeywordSection.vue`）；
 *  2. 搜索**无结果**时空状态的推荐词 chip（`App.vue`）。
 *
 * 第 2 处此前吃的是 `/api/hot-searches`（真实搜索日志统计出来的「昨日热搜」），
 * 官方站 2026-09-23 改成本词表并下线了热搜端点：统计热搜有三个毛病——① 不可控
 * （统计出来的词本身可能就没有覆盖，用户点了还是空状态）；② 要多打一次接口；
 * ③ 部分机型上还要额外一次随机子集计算。换成运营手工维护的固定词后，空状态
 * 推的词都是确保有资源的，且与下方区块共用一份数据、零额外请求。
 *
 * 失败语义：拉取失败或词表为空 → 消费方各自不渲染（首页不该因为一个装饰性
 * 区块报错），且标记 loaded 避免反复重试。
 */
import { ref } from "vue";
import { API_BASE } from "../config";

const keywords = ref<string[]>([]);
/** 是否已完成一次拉取（成功/失败都算；用于避免重复发请求） */
const loaded = ref(false);
const loading = ref(false);
/** 在途请求：并发调用（两个组件同时挂载）合并成同一个请求 */
let inflight: Promise<void> | null = null;

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/hot-keywords`);
    const data: { code?: number; data?: { keywords?: unknown } } = await res.json();
    const list = data?.code === 0 ? data.data?.keywords : [];
    keywords.value = Array.isArray(list)
      ? list.filter((kw): kw is string => typeof kw === "string" && !!kw)
      : [];
  } catch {
    keywords.value = [];
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

export function useHotKeywords() {
  /** 首次调用触发拉取，之后复用结果（并发调用合流） */
  function ensureLoaded(): Promise<void> {
    if (loaded.value) return Promise.resolve();
    inflight ||= load().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return { keywords, loading, loaded, ensureLoaded };
}
