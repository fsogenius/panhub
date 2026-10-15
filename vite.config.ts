import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/**
 * 纯静态前台构建配置
 *
 * 关键约束：产物必须"丢到任何静态托管就能跑"，因此
 * - `base: "./"` 使用相对路径，支持部署在子路径（如 GitHub Pages 的 /repo/）
 * - 产物文件名固定（不打 hash），方便部署方直接阅读/覆盖
 * - 全部代码打成一个 app.js，避免多 chunk 在无 rewrite 的静态托管上 404
 */
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // site-navbar 是外部脚本注册的原生 Web Component
          // （含站点导航与头像登录），提示 Vue 按自定义元素处理，
          // 否则会被当成未解析组件、渲染不出来
          isCustomElement: (tag: string) => tag === "site-navbar",
        },
      },
    }),
  ],
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    target: "es2020",
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        // 静态托管没有路由 rewrite，禁止代码分割成多入口
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 4001,
  },
});
