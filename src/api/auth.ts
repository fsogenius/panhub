/**
 * 微信登录（第三方静态站模式）
 *
 * 与主站的区别：主站在自己域名上，后端读 `wxauth-token` Cookie 完成认证；
 * 静态站部署在**别人的域名**上，Cookie 跨站不会被浏览器带上，因此必须改用
 * `Authorization: Bearer <token>`——panhub 后端的 getCredential() 本身就
 * 优先识别 Bearer（与小程序共用同一条校验链路），无需服务端改动。
 *
 * token 从哪来：
 * wx-auth-sdk 登录成功后会把 token 写进**当前域名**的 Cookie
 * （JS 写入 → 非 HttpOnly → 前端可直接读取），我们把它读出来当 Bearer 用。
 * 注意该 Cookie 带 SameSite=Strict，但这只影响跨站*发送*，不影响本页*读取*。
 *
 * 登录流程与主站完全一致：关注公众号 + 验证码（或小程序扫码），强制不可跳过。
 */
import { ref, watch } from "vue";
import { WX_AUTH_API_BASE, WX_AUTH_SDK_URLS } from "../config";

export interface WxAuthUser {
  openid?: string;
  type?: string;
  nickname?: string;
  avatar?: string;
  [key: string]: any;
}

/** wx-auth-sdk UMD 暴露的全局单例接口（只列本工程用到的） */
export interface WxAuthSDK {
  init(options?: Record<string, any>): void;
  silentCheck(): Promise<boolean>;
  showAuthModal(): Promise<void>;
  requireAuth(): Promise<boolean>;
  clearToken(): void;
  getToken?(): string | null;
  onVerified(user: any): void;
  onError(error: any): void;
  /**
   * 匿名票据（SDK ≥1.2.44，2026-09-24 访客准入）：
   * init() 时已自动预签一张票存 localStorage（180 天有效），
   * 这里取现成的（签发失败/断网返回 null —— fail-open）。
   * 旧版本 SDK 没有该方法（运行时用可选调用兜底）。
   */
  getOrCreateAnonTicket?: () => Promise<string | null>;
}

declare global {
  interface Window {
    WxAuth?: WxAuthSDK;
  }
}

const SDK_SCRIPT_ID = "wx-auth-sdk-umd";
const TOKEN_COOKIE = "wxauth-token";

// ===== SDK 加载 =====

let sdkPromise: Promise<WxAuthSDK> | null = null;

/**
 * 等待 UMD 全局单例就绪；脚本缺失时自行按 CDN 列表补插（1.5s 后仍未挂载，
 * 依次尝试 unpkg → jsdelivr，单个源 6s 无响应切下一个）。
 * 加载失败抛出异常，调用方决定降级行为，下次调用可重试。
 */
export function resolveWxAuth(timeoutMs = 10000): Promise<WxAuthSDK> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<WxAuthSDK>((resolve, reject) => {
    const startedAt = Date.now();
    /** CDN 补插进度：index.html 引导脚本加载失败后，这里从下一个源继续 */
    let fallbackIdx = 0;
    const poll = () => {
      if (window.WxAuth) return resolve(window.WxAuth);
      if (Date.now() - startedAt >= timeoutMs) {
        sdkPromise = null;
        return reject(new Error("wx-auth-sdk 加载超时"));
      }
      if (
        Date.now() - startedAt >= 1500 &&
        !document.getElementById(SDK_SCRIPT_ID) &&
        fallbackIdx < WX_AUTH_SDK_URLS.length
      ) {
        const el = document.createElement("script");
        el.id = SDK_SCRIPT_ID;
        el.src = WX_AUTH_SDK_URLS[fallbackIdx++];
        document.head.appendChild(el);
      }
      setTimeout(poll, 50);
    };
    poll();
  });
  return sdkPromise;
}

// ---------------------------------------------------------------------------
// 匿名票据（对齐官方站 2026-09-24 访客准入）
//
// 搜索对未登录访客放开后，建 SSE 连接前要把票据拼在 URL ?at= 上。刻意不走
// Cookie：跨站部署写不回 Cookie，统一 localStorage + URL 参数；且流式连接
// 不能靠「401 再补签重试」（EventSource/fetch 流遇错重连会抖成风暴），
// 票必须在建连前就位（init 预签已保证，这里只是取现成的）。
// ---------------------------------------------------------------------------

const ANON_TICKET_RETRY_MS = 60_000;
let anonTicketPromise: Promise<string | null> | null = null;
let anonTicketFailedAt = 0;

/**
 * 安全获取匿名票据（任何失败返回 null —— fail-open，是否放行无票请求由
 * 服务端定夺：观察期放行 + 记日志）。失败缓存 60s，防每次搜索都空撞 SDK。
 */
export async function getAnonTicketSafe(timeoutMs = 3000): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (anonTicketPromise) return anonTicketPromise;
  if (Date.now() - anonTicketFailedAt < ANON_TICKET_RETRY_MS) return null;
  anonTicketPromise = (async () => {
    try {
      const WxAuth = await resolveWxAuth();
      const fn = WxAuth.getOrCreateAnonTicket;
      if (typeof fn !== "function") {
        // 旧版 SDK（<1.2.44）：无票据能力，按无票处理
        return null;
      }
      const t = await Promise.race([
        Promise.resolve(fn.call(WxAuth)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      if (typeof t !== "string" || t.length === 0) {
        throw new Error("匿名票据签发失败或为空");
      }
      return t;
    } catch (e) {
      anonTicketFailedAt = Date.now();
      console.warn("[wx-auth] 匿名票据获取失败（按无票请求发送）", e);
      return null;
    } finally {
      anonTicketPromise = null; // 允许下次调用重试（成功路径读 localStorage，开销极小）
    }
  })();
  return anonTicketPromise;
}

// ===== token 读写 =====

/** 从本域 Cookie 读取登录凭证（SDK 登录成功时写入） */
export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]*)`)
  );
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

/** 是否已登录（本地判断，权威校验在服务端） */
export function hasToken(): boolean {
  return !!getToken();
}

// ===== 认证状态（模块级单例，跨组件共享） =====

export const isVerified = ref(false);
export const isReady = ref(false);

let silentSettled = false;
let silentPromise: Promise<void> = Promise.resolve();

/**
 * 应用启动时调用一次：初始化 SDK 并做静默登录态校验。
 * Cookie 有效 → onVerified → isVerified = true（后续搜索零打扰）。
 */
export function initAuth(): void {
  silentPromise = new Promise<void>((resolveSettled) => {
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      silentSettled = true;
      isReady.value = true;
      resolveSettled();
    };
    // 兜底：silentCheck 失败时不会触发任何回调，避免调用方永久挂起
    const failTimer = setTimeout(settle, 5000);

    resolveWxAuth()
      .then((WxAuth) => {
        WxAuth.init({
          apiBase: WX_AUTH_API_BASE,
          // silent: 只做 Cookie 静默校验，不自动弹窗（弹窗时机由 checkSearchAuth 控制）
          silent: true,
          // required: 弹窗不可关闭、遮罩不可点穿，必须完成验证
          required: true,
          onVerified: () => {
            if (!isVerified.value) isVerified.value = true;
            clearTimeout(failTimer);
            settle();
          },
          onError: () => {
            clearTimeout(failTimer);
            settle();
          },
        });
      })
      .catch((err) => {
        console.warn("[auth] wx-auth-sdk 加载失败，跳过静默校验", err);
        clearTimeout(failTimer);
        settle();
      });
  });
}

/** 等待 isVerified 置位（登录完成信号） */
function waitForVerified(timeoutMs = 5 * 60_000): Promise<void> {
  return new Promise((resolve) => {
    if (isVerified.value) return resolve();
    const stop = watch(isVerified, (v) => {
      if (v) {
        stop();
        clearTimeout(timer);
        resolve();
      }
    });
    const timer = setTimeout(() => {
      stop();
      resolve();
    }, timeoutMs);
  });
}

/** 弹出登录窗并等待用户完成验证 */
async function promptLogin(): Promise<boolean> {
  const WxAuth = await resolveWxAuth().catch((err) => {
    console.error("[auth] SDK 不可用，无法弹出登录窗", err);
    return null;
  });
  if (!WxAuth) return false;
  // 注意：不用 requireAuth() 的返回值——SDK 在某些成功后路径上会先
  // resolve(false) 再触发 onVerified，依赖它会把成功误判为失败。
  void WxAuth.showAuthModal();
  await waitForVerified();
  return isVerified.value;
}

/**
 * 每次搜索前调用：
 * - 本地无 Cookie → 必然是未登录，直接弹窗（不等 SDK 静默校验，避免首搜白等）
 * - 有 Cookie → 等静默校验收敛；有效则静默放行，无效则弹窗
 *
 * 补充（顶部导航接入后）：用户可能是刚在 site-navbar 的头像入口登录的，
 * 此时 Cookie 已有、但页面加载期的静默校验早已跑完（isVerified 仍为 false）。
 * 这种情况下主动再校验一次，避免「明明已登录，点搜索又弹一遍窗」。
 */
export async function checkSearchAuth(): Promise<boolean> {
  if (!silentSettled) await silentPromise;
  if (isVerified.value) return true;

  if (hasToken()) {
    const WxAuth = await resolveWxAuth().catch(() => null);
    if (WxAuth) {
      try {
        const ok = await WxAuth.silentCheck();
        if (ok || isVerified.value) {
          isVerified.value = true;
          return true;
        }
      } catch {
        // 校验异常（网络抖动等）→ 落到下方弹窗，由用户手动确认
      }
    }
  }

  return promptLogin();
}

/** 服务端返回 401 时调用：本地登录态已失效，强制重新验证 */
export async function forceVerify(): Promise<boolean> {
  isVerified.value = false;
  return promptLogin();
}
