/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/** 热搜词云（无官方类型声明，按需动态 import） */
declare module "TagCloud";

