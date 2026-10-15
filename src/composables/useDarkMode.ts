// 暗色模式：纯跟随系统 prefers-color-scheme，无手动切换、无本地存储覆盖。
// index.html 里的阻塞脚本负责首屏即时应用主题，这里仅负责响应系统主题实时变化。
export function useDarkMode() {
  function applyTheme(dark: boolean) {
    document.documentElement.classList.toggle("dark", dark);
  }

  function init() {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(media.matches);
    media.addEventListener("change", (e) => applyTheme(e.matches));
  }

  return { init };
}
