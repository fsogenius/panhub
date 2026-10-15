/** 单条搜索结果的统一模型（与后端 merged_by_type 结构对齐） */
export interface MergedLink {
  url: string;
  password?: string;
  note?: string;
  datetime?: string;
  source?: string;
  /**
   * 转存标识。有 tid 说明该盘型已接入官方转存：直链已被服务端剥离，
   * 必须调 POST /api/transfer 换回我们的新分享链接才能拿到内容。
   */
  tid?: string;
}

/** 按网盘类型分组的结果集 */
export type MergedLinks = Record<string, MergedLink[]>;

/** 后端统一响应信封 */
export interface GenericResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface SearchResponse {
  merged_by_type?: MergedLinks;
  results?: any[];
  items?: any[];
  list?: any[];
  [key: string]: any;
}

/** 平台展示信息（图标位于 public/icons/） */
export interface PlatformInfo {
  name: string;
  color: string;
  icon: string;
}
