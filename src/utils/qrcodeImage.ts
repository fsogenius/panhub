/**
 * 资源二维码渲染（2026-09-21）
 *
 * 用 qrcode-generator（零依赖、不依赖 canvas）在浏览器现场出码，不经过任何
 * 后端或第三方图片服务，因此没有额外请求、也没有外链可用性问题。
 *
 * 只在「PC 弹窗要展示资源码」时才动态 import，不进入首屏 bundle。
 *
 * 输出 SVG 的 data URL（矢量）：全屏放大后依然锐利，屏幕扫码不糊；走
 * <img src> 而非 v-html，避免把第三方库生成的标记直接塞进 DOM。
 */
type QrFactory = typeof import("qrcode-generator");

let factoryPromise: Promise<QrFactory> | null = null;

function loadFactory(): Promise<QrFactory> {
  if (!factoryPromise) {
    factoryPromise = import("qrcode-generator").then(
      // export = 的 CJS 模块：取到 default 还是模块自身取决于打包器，两者都兜住
      (mod: any) => (mod?.default ?? mod) as QrFactory
    );
  }
  return factoryPromise;
}

/**
 * 文本 → 二维码 data URL。失败返回空串（调用方按「码暂时生成不了」展示，
 * 不阻断弹窗里其它可用路径）。
 */
export async function renderQrDataUrl(text: string): Promise<string> {
  const value = (text || "").trim();
  if (!value) return "";
  try {
    const factory = await loadFactory();
    // typeNumber=0 自动选版本；纠错等级 M（约 15% 冗余，屏幕扫码的通用档）
    const qr = factory(0, "M");
    qr.addData(value);
    qr.make();
    // scalable：只出 viewBox，实际尺寸交给 CSS（同一张图既能小图展示也能全屏放大）
    const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return "";
  }
}
