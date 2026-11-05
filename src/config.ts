/**
 * 数据源地址：PanSou 公开搜索 API
 *
 * PanSou（https://github.com/fish2018/pansou）是 MIT 开源的网盘聚合搜索后端，
 * 搜索接口公开、无需登录，返回结果直接带原始分享链接。可用构建时环境变量
 * `VITE_PANSOU_API_BASE` 指向自建实例（如 http://localhost:8888/api）。
 *
 * 默认用公共演示站便于开箱即用；它由第三方维护，长期稳定请务必自建。
 */
const DEFAULT_API_BASE = "https://so.252035.xyz/api";

export const API_BASE = String(
  import.meta.env.VITE_PANSOU_API_BASE || DEFAULT_API_BASE
).replace(/\/+$/, "");

/**
 * 是否启用链接探活。
 *
 * PanSou 的探活接口是 POST /api/check/links，但公共演示站尚未升级（404）。
 * 自建新版 PanSou 可改为 true 并适配 useLinkCheck 的请求格式。
 */
export const ENABLE_LINK_CHECK = false;

/** wx-auth 公共登录服务（保留给 site-navbar，不再参与搜索流程） */
export const WX_AUTH_API_BASE = "https://wx-auth.shenzjd.com";

/**
 * wx-auth-sdk UMD 包（全局单例 window.WxAuth）的 CDN 候选列表。
 *
 * 容灾（对齐官方站 2026-09-20）：unpkg 主源、jsdelivr 备源——服务器在海外，
 * 约七成用户在中国，unpkg 一旦不可达（TCP 黑洞时 onerror/onload 都不触发），
 * 认证弹窗这条硬门槛会直接不可用。按列表顺序尝试，单个失败/超时立即切下一个。
 *
 * 版本下限（对齐官方站 2026-09-24）：匿名票据 getOrCreateAnonTicket 需
 * SDK ≥1.2.44——unpkg 锁 ^1.2.44（minor 自动跟进），jsdelivr 锁 @1（major
 * 锁定）。major breaking 不会静默上线。
 */
export const WX_AUTH_SDK_URLS: readonly string[] = [
  "https://unpkg.com/wx-auth-sdk@^1.2.44/dist/wx-auth.umd.js",
  "https://cdn.jsdelivr.net/npm/wx-auth-sdk@1/dist/wx-auth.umd.js",
];

/** 主源（旧配置名保留：app 内动态补插兜底仍先试主源） */
export const WX_AUTH_SDK_URL = WX_AUTH_SDK_URLS[0];

export const SITE_NAME = "PanHub";

/** 每轮搜索的累计结果上限（与后端默认一致：达到后出现「继续」） */
export const MAX_RESULTS_PER_ROUND = 90;
