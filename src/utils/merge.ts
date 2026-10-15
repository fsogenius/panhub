import type { MergedLinks } from "../types";

/**
 * 按类型合并搜索结果，按 tid||url 去重。
 *
 * 有 tid 的条目直链已被服务端剥离（url 为空串），去重键必须用 tid 兜底，
 * 否则剥离后的条目会因 url 全部相同而互相吞掉。
 */
export function mergeMergedByType(
  target: MergedLinks,
  incoming?: MergedLinks
): MergedLinks {
  if (!incoming) return target;
  const out: MergedLinks = { ...target };
  for (const type of Object.keys(incoming)) {
    const existed = out[type] || [];
    const next = incoming[type] || [];
    const seen = new Set<string>(existed.map((x) => x.tid || x.url));
    const mergedArr = [...existed];
    for (const item of next) {
      const key = item.tid || item.url;
      if (!seen.has(key)) {
        seen.add(key);
        mergedArr.push(item);
      }
    }
    out[type] = mergedArr;
  }
  return out;
}

/** 统计结果总数（按分组条目数累加） */
export function countMerged(merged: MergedLinks): number {
  return Object.values(merged).reduce((sum, arr) => sum + (arr?.length || 0), 0);
}
