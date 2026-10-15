/**
 * 统一请求封装
 *
 * 两条硬约束（第三方域名部署场景）：
 * 1. `credentials: "omit"`——不使用 Cookie。服务端 CORS 是
 *    `Access-Control-Allow-Origin: *`，浏览器的凭证模式请求会被直接拒绝；
 *    认证完全依赖 Authorization 头。
 * 2. 全部请求走绝对地址（API_BASE 前缀），不依赖当前站点路由。
 */
import { API_BASE } from "../config";
import { getToken } from "./auth";

export class ApiError extends Error {
  statusCode: number;
  data: any;
  constructor(message: string, statusCode: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

/** 拼完整 URL（含查询参数，自动跳过 undefined/null/空串） */
export function apiUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>
): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return url;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `${url}?${qs}` : url;
}

/** 认证请求头：已登录时带上 Bearer，未登录返回空对象 */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(resp: Response): Promise<ApiError> {
  let message = `请求失败（${resp.status}）`;
  let data: any = undefined;
  try {
    data = await resp.json();
    if (data?.message) message = String(data.message);
    else if (data?.statusMessage) message = String(data.statusMessage);
  } catch {}
  return new ApiError(message, resp.status, data);
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, any>,
  init?: RequestInit
): Promise<T> {
  const resp = await fetch(apiUrl(path, params), {
    method: "GET",
    credentials: "omit",
    headers: { accept: "application/json", ...authHeaders() },
    ...init,
  });
  if (!resp.ok) throw await readError(resp);
  return (await resp.json()) as T;
}

export async function apiPost<T>(
  path: string,
  body?: any,
  init?: RequestInit
): Promise<T> {
  const resp = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "omit",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });
  if (!resp.ok) throw await readError(resp);
  return (await resp.json()) as T;
}
