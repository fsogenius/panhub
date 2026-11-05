/**
 * 搜索主流程（PanSou 数据源）
 *
 * 对接 PanSou 的 `GET /api/search`（`res=merge`），一次请求返回按网盘类型聚合的
 * `merged_by_type`。与 PanHub 官方后端的 SSE / 登录票据不同，PanSou 是公开接口：
 * 无需登录、无需匿名票据，结果里直接带原始分享链接。
 *
 * 「继续搜索」在 PanSou 模式下没有增量语义（服务端一次返回当轮全部结果），
 * 这里保留按钮契约：暂停后点「继续」= 重新请求一次并整体替换结果。
 */
import { computed, ref } from "vue";
import { apiUrl } from "../api/client";
import type { MergedLinks, SearchResponse } from "../types";
import { countMerged, mergeMergedByType } from "../utils/merge";

export interface SearchOptions {
  keyword: string;
  /** 类别搜索（空 = 全部网盘），映射到 PanSou 的 cloud_types */
  cat?: string;
  /** 保留旧接口签名；PanSou 不需要登录，回调不会被触发 */
  onAuthRequired?: () => void;
}

interface SearchEnvelope {
  code?: number;
  message?: string;
  data?: SearchResponse;
}

/** 单次搜索超时：PanSou 的异步插件通常数秒返回，慢源最多等 60s */
const REQUEST_TIMEOUT_MS = 60_000;

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
  let activeController: AbortController | null = null;
  const autoPausedAtLimit = ref(false);

  function cancelActiveRequests(): void {
    if (!activeController) return;
    try {
      activeController.abort();
    } catch {}
    activeController = null;
  }

  function pauseSearch(): void {
    if (state.value.loading || state.value.deepLoading) {
      state.value.paused = true;
      cancelActiveRequests();
    }
  }

  function resetSearch(): void {
    cancelActiveRequests();
    searchSeq++;
    autoPausedAtLimit.value = false;
    state.value.loading = false;
    state.value.deepLoading = false;
    state.value.paused = false;
    state.value.error = "";
    state.value.searched = false;
    state.value.elapsedMs = 0;
    state.value.total = 0;
    state.value.merged = {};
  }

  /** 请求 PanSou 搜索接口，返回 merged_by_type（失败抛错） */
  async function fetchMerged(keyword: string, cat?: string): Promise<MergedLinks> {
    const params: Record<string, string> = { kw: keyword, res: "merge" };
    if (cat) params.cloud_types = cat;

    const controller = new AbortController();
    activeController = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const resp = await fetch(apiUrl("/search", params), {
        signal: controller.signal,
        // 公共 API 无关 Cookie，避免跨域凭证请求被拒
        credentials: "omit",
        headers: { accept: "application/json" },
      });
      if (!resp.ok) {
        throw new Error(`搜索服务暂时不可用（${resp.status}），请稍后重试`);
      }
      const body = (await resp.json()) as SearchEnvelope;
      if (body?.code !== 0) {
        throw new Error(body?.message || "搜索服务返回异常");
      }
      const merged = body?.data?.merged_by_type;
      return merged && typeof merged === "object" ? merged : {};
    } catch (error: any) {
      const isAbort =
        error?.name === "AbortError" || error?.cause?.name === "AbortError";
      if (isAbort && timedOut) throw new Error("搜索超时，请稍后重试");
      throw error;
    } finally {
      clearTimeout(timer);
      if (activeController === controller) activeController = null;
    }
  }

  async function runSearch(
    options: SearchOptions,
    mySeq: number,
    replace: boolean
  ): Promise<void> {
    try {
      const merged = await fetchMerged(options.keyword.trim(), options.cat);
      if (mySeq !== searchSeq) return;
      state.value.merged = replace
        ? merged
        : mergeMergedByType(state.value.merged, merged);
      state.value.total = countMerged(state.value.merged);
    } catch (error: any) {
      if (mySeq !== searchSeq) return;
      // 主动 abort（暂停 / 重置）不算失败
      const isAbort =
        error?.name === "AbortError" || error?.cause?.name === "AbortError";
      if (isAbort) return;
      state.value.error = error?.message || "网络异常，搜索中断，请重试";
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
    state.value.paused = false;
    autoPausedAtLimit.value = false;

    const mySeq = ++searchSeq;
    const start = performance.now();

    try {
      // replace：新关键词直接替换旧结果，避免两轮结果混在同一张列表里
      await runSearch(options, mySeq, true);
    } finally {
      if (mySeq === searchSeq) {
        state.value.elapsedMs = Math.round(performance.now() - start);
        // 暂停时保持 loading=true，让「继续」按钮留在原位
        if (!state.value.paused) state.value.loading = false;
        state.value.deepLoading = false;
      }
    }
  }

  async function continueSearch(options: SearchOptions): Promise<void> {
    if (!state.value.paused || !state.value.searched) return;

    state.value.paused = false;
    state.value.loading = true;
    state.value.deepLoading = true;
    state.value.error = "";
    const mySeq = ++searchSeq;
    const start = performance.now();

    try {
      await runSearch(options, mySeq, true);
    } finally {
      if (mySeq === searchSeq) {
        state.value.elapsedMs = Math.round(performance.now() - start);
        state.value.deepLoading = false;
        if (!state.value.paused) state.value.loading = false;
      }
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
