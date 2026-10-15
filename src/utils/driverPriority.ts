/**
 * 盘型分组排序（与官方站同一规则）
 *
 * 背景：结果页是**按网盘平台分组**渲染的（每个平台一个卡片 + 顶部平台页签），
 * 组顺序原本是「结果数降序」。
 *
 * 当前规则：
 *   1) **前几个位置固定给接了转存的五家盘型**（夸克/百度/迅雷/UC/移动）——
 *      这几家能一键转存，用户点了就有东西拿，值得占住首屏；
 *   2) 五盘**内部按结果数降序**（谁的资源多谁在前）；
 *   3) 第 6 位起是其余盘型（115 / 天翼 / 阿里 / 123 / 磁力…），同样按结果数降序；
 *   4) 数量相同按盘型名稳定排序。
 * 本次搜索没有结果的盘型自然不占位（空分组由调用方过滤）。
 *
 * 为什么不做「全部按结果数排」：结果数最多的几乎总是夸克，但 115/天翼这类
 * 转不了的盘也常常量很大——它们排在五盘前面，用户点进去只能拿到原始链接，
 * 与「能一键转存」的盘混在一起看，等于把最有价值的入口埋了。
 */

/** 接了转存的五家盘型（只用于成员判定，**不含顺序语义**——它们之间按结果数排） */
export const TRANSFER_DRIVERS: readonly string[] = [
  "quark",
  "baidu",
  "xunlei",
  "uc",
  "mobile",
];

/**
 * 盘型分组排序。
 * @param types   参与排序的盘型（调用方需自行滤掉空分组）
 * @param countOf 取该盘型的结果数（五盘之间、非五盘之间都按它降序）
 */
export function orderDriverGroups(
  types: readonly string[],
  countOf: (type: string) => number
): string[] {
  const isTransferDriver = (type: string) => TRANSFER_DRIVERS.includes(type);

  return [...types].sort((a, b) => {
    // 第一优先级：是不是接了转存的五家（是的一律排在其余盘型之前）
    const rankA = isTransferDriver(a) ? 0 : 1;
    const rankB = isTransferDriver(b) ? 0 : 1;
    if (rankA !== rankB) return rankA - rankB;
    // 同一档内（五盘之间 / 非五盘之间）比结果数，多的在前
    const diff = countOf(b) - countOf(a);
    if (diff !== 0) return diff;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
