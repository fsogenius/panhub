import type { PlatformInfo } from "../types";

/**
 * 平台展示信息：图标都在本工程的 public/icons/ 下，
 * 因此静态版是自包含的，不依赖任何外部 CDN。
 */
export const PLATFORM_INFO: Record<string, PlatformInfo> = {
  aliyun: { name: "阿里云盘", color: "#7c3aed", icon: "./icons/aliyun.png" },
  quark: { name: "夸克网盘", color: "#6366f1", icon: "./icons/quark.png" },
  baidu: { name: "百度网盘", color: "#2563eb", icon: "./icons/baidu.png" },
  "115": { name: "115网盘", color: "#f59e0b", icon: "./icons/115.png" },
  xunlei: { name: "迅雷云盘", color: "#fbbf24", icon: "./icons/xunlei.png" },
  uc: { name: "UC网盘", color: "#ef4444", icon: "./icons/uc.png" },
  tianyi: { name: "天翼云盘", color: "#ec4899", icon: "./icons/tianyi.png" },
  "123": { name: "123网盘", color: "#10b981", icon: "./icons/123.png" },
  mobile: { name: "移动云盘", color: "#0ea5e9", icon: "./icons/mobile.png" },
  others: { name: "其他网盘", color: "#6b7280", icon: "./icons/others.png" },
  magnet: { name: "磁力链接", color: "#22c55e", icon: "./icons/magnet.png" },
  gutenberg: {
    name: "古登堡计划",
    color: "#8b6f47",
    icon: "./icons/gutenberg.svg",
  },
  wikisource: {
    name: "维基文库",
    color: "#0f766e",
    icon: "./icons/wikisource.svg",
  },
  // 正版源矩阵（合规源不挂 tid、不剥离直链，条目直指在线阅读/下载）
  wikibooks: {
    name: "维基教科书",
    color: "#0369a1",
    icon: "./icons/wikibooks.svg",
  },
  openlibrary: {
    name: "开放图书馆",
    color: "#d97706",
    icon: "./icons/openlibrary.svg",
  },
  doaj: {
    name: "DOAJ 开放期刊",
    color: "#ea580c",
    icon: "./icons/doaj.svg",
  },
  doab: {
    name: "DOAB 开放专著",
    color: "#1b75bb",
    icon: "./icons/doab.svg",
  },
};

/** 类别搜索下拉项（slug 与后端 cat 参数一致） */
export const SEARCH_CATS = [
  { value: "quark", label: "夸克网盘" },
  { value: "baidu", label: "百度网盘" },
  { value: "xunlei", label: "迅雷网盘" },
  { value: "uc", label: "UC网盘" },
  { value: "mobile", label: "移动网盘" },
  { value: "tianyi", label: "天翼网盘" },
  { value: "aliyun", label: "阿里网盘" },
  { value: "115", label: "115网盘" },
  { value: "123", label: "123网盘" },
];

export const platformInfo = (type: string): PlatformInfo =>
  PLATFORM_INFO[type] || {
    name: type,
    color: "#9ca3af",
    icon: "./icons/others.png",
  };
