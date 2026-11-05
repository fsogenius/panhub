import { createApp } from "vue";
import App from "./App.vue";
import "./styles/global.css";
import "./styles/dark-mode.css";
import { API_BASE } from "./config";

createApp(App).mount("#app");

console.info(`[PanHub] 静态版已启动，接口地址：${API_BASE}`);
