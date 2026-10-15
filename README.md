# PanHub · 全网最全的网盘搜索

> 一个搜索框，搜遍全网网盘资源 —— 即搜即得、聚合去重、轻量部署

**在线体验**：<https://panhub.shenzjd.com>

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwu529778790%2Fpanhub.shenzjd.com)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fwu529778790%2Fpanhub.shenzjd.com)

## ✨ 核心特性

- **多源聚合**：Telegram 频道 + 第三方插件，聚合去重、智能排序
- **一键获取**：接入转存的网盘可换取新分享链接，自动拼装各网盘官方口令；
  桌面端出**资源二维码**（扫码转手机端保存），移动端地址点开即用
- **访客可搜**：搜索不强制登录（匿名票据），登录卡点收敛到「获取」转存
- **链接探活**：疑似失效弱提示（琥珀角标），真实转存给结论，不误拦
- **推荐词 + 精选资源**：热词快搜与精选资源清单，点击即搜
- **零运维**：纯静态页面，构建产物丢到任意静态托管即可运行
- **多端部署**：GitHub Pages（内置 CI）/ Cloudflare Pages / Vercel / Docker

## ⚡ 一键部署

最快方式：点 README 顶部的 **Deploy with Vercel** / **Deploy to Cloudflare** 按钮，
授权 GitHub 仓库后一路下一步即可（两平台都会自动识别 Vite 工程：
构建命令 `npm run build`、输出目录 `dist`，无需任何配置）。

### GitHub Pages（本仓库已内置自动部署）

推送 `main` 即自动构建并发布，无需手动跑构建。Action 会尝试自动开启 Pages，
若因仓库权限导致失败，手动开启一次即可：

1. 打开仓库 **Settings → Pages**
2. **Source** 选择 **GitHub Actions**
3. 到 **Actions** 页等 `Deploy to GitHub Pages` 跑完，访问
   `https://<用户名>.github.io/<仓库名>/`

### 其他平台

| 平台 | 设置 |
|------|------|
| Cloudflare | 点顶部按钮一键部署（仓库已内置 `wrangler.jsonc`）；或构建后 `npx wrangler deploy` |
| Vercel | 点顶部按钮一键部署，或框架预设选 `Vite`、构建命令 `npm run build`、输出目录 `dist` |
| Docker | 见下一节（仓库已内置 Dockerfile） |
| 任意静态托管 | 本地 `npm run build` 后，把 `dist/` 整个目录上传 |

> 构建时 `base` 已设为相对路径，部署在子路径（如 `/仓库名/`）也能正常工作。

### Docker（镜像由 CI 自动发布到 GHCR，push 到 `main` 即更新）

```bash
docker run -d --name panhub.shenzjd.com -p 8080:80 ghcr.io/wu529778790/panhub.shenzjd.com:latest
# 打开 http://localhost:8080
```

> 本地没有镜像时 `docker run` 会自动拉取，无需手动 build。

- 两阶段构建：Node 20 编译产物 → `nginx:1.27-alpine` 托管，镜像里不含源码与 node_modules
- nginx 已配好 gzip、协商缓存（产物文件名固定不打 hash，no-cache + ETag 保证发版即生效）
  与 `try_files` 兜底，自带 `HEALTHCHECK`
- 反代或端口映射随意（容器内监听 80），无需任何环境变量

## 📦 支持平台

阿里云盘 / 夸克 / 百度网盘 / 115 / 迅雷 / UC / 天翼云盘 / 123 网盘 / 移动云盘 / 磁力链接

## 🔐 登录

搜索对访客开放（wx-auth 签发的匿名票据随请求上报）；「获取」转存需登录：
登录态由独立的认证服务 wx-auth 校验（关注公众号 + 验证码 / 小程序扫码）。

## ⚠️ 注意事项

- 请使用浏览器访问，不要用脚本或服务端代理转发请求
- 请勿在仓库中提交密钥或私有配置

## 🛡️ 免责声明

- 不存储、不传播任何受版权保护的内容；资源链接均来自公开网络
- 请遵守当地法律法规与平台使用条款；侵权问题请联系源站处理

## 📄 开源协议

本项目基于 [PolyForm Noncommercial License 1.0.0](./LICENSE) 授权：

- ✅ 允许个人学习、研究等**非商业用途**的自由使用、修改与分发
- ❌ 任何商业用途（包括但不限于销售、收费服务、商业网站部署、广告变现）需事先获得作者书面授权
