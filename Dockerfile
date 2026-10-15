# ---- 构建阶段：Node 20 编译纯静态产物 ----
FROM node:20-alpine AS build
WORKDIR /app

# 先拷贝依赖清单再装依赖：源码变动不触发重装（层缓存）
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- 运行阶段：nginx 托管静态产物 ----
FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# 健康检查：首页可达即视为健康
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
