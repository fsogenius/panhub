/**
 * 转存成功后的口令文案（2026-09-08 从 useTransfer.ts 抽出为纯函数，便于单测）
 *
 * 各盘型官方口令格式（剪贴板识别机制，格式错了 APP 打不开/不弹转存窗）：
 * - 夸克（2026-09-05 实测）：多行，开头话术 + 「链接：」「提取码：」标签行；
 * - 百度（2026-09-07 实测）：单行「链接：xxx 提取码：xxx」+ 官方提示语；
 * - 迅雷（2026-09-08 用户对照官方格式校准）：链接带 ?pwd=xxx# + App 话术；
 * - UC（2026-09-08 用户对照官方格式）：多行「来自UC网盘分享文件：」开头。
 *
 * 识别不了盘型时走**通用格式**（2026-09-16 用户拍板）：不再回退夸克话术——
 * 非五盘（115/天翼/123/139/磁力…）套夸克话术会给出「打开夸克APP」的错误引导，
 * 用户复制后打不开。通用格式只说「对应网盘 App」，不编造平台。
 */

export type ShareDriver = "quark" | "baidu" | "xunlei" | "uc";

/** 按口令/链接文本识别网盘 */
export function driverOf(text?: string): ShareDriver | null {
  if (!text) return null;
  if (text.includes("pan.quark.cn")) return "quark";
  if (text.includes("pan.baidu.com")) return "baidu";
  if (text.includes("pan.xunlei.com")) return "xunlei";
  if (text.includes("drive.uc.cn")) return "uc";
  return null;
}

/**
 * 链接是否已带提取码参数（2026-09-21）
 *
 * 原链接交付路径（该盘型凭证未配 / 未接入转存）下发的 share_url 本身就是官方
 * 分享链接形态、**自带提取码参数**，与单独下发的 passcode 是同一份信息。再拼
 * 一次会得到 `?pwd=x&pwd=x`（2026-09-21 实测：迅雷原链接）。
 * 参数名两个都认：百度/迅雷是 `pwd`，115 是 `password`。
 */
function hasPwdParam(url: string): boolean {
  return /[?&](?:pwd|password)=/i.test(url);
}

/**
 * 各盘官方分享链接**自己就在用**的提取码参数名（不是我们发明的）：
 * 百度/迅雷 `?pwd=`；115 `?password=`（115 官方分享页实测形态
 * `https://115cdn.com/s/xxx?password=yyyy`）。
 *
 * 阿里云盘/天翼云盘/123云盘的参数名尚未确认，一律不猜——拼错参数既没用又可能
 * 干扰链接识别，那些盘型只给裸链接，提取码由弹窗文本另行展示。
 */
const QR_PWD_PARAM: Array<[RegExp, string]> = [
  [/pan\.baidu\.com/i, "pwd"],
  [/pan\.xunlei\.com/i, "pwd"],
  [/(?:115|115cdn|anxia)\.com/i, "password"],
];

function pwdParamOf(url: string): string {
  for (const [re, param] of QR_PWD_PARAM) {
    if (re.test(url)) return param;
  }
  return "";
}

/**
 * APP 名规则表（顺序即优先级，2026-09-21 扩展）
 *
 * 与 driverOf 的分工：driverOf 决定**口令格式**（未知盘型一律走通用格式，不冒充
 * 平台）；这里只决定「告诉用户打开哪个 APP」，所以可以覆盖五盘之外的常见盘型——
 * 阿里云盘这类未接入转存的盘型也出二维码，标题得说得出 APP 名。
 */
const APP_NAME_RULES: Array<[RegExp, string]> = [
  [/pan\.quark\.cn/i, "夸克"],
  [/pan\.baidu\.com/i, "百度网盘"],
  [/pan\.xunlei\.com/i, "迅雷"],
  [/drive\.uc\.cn/i, "UC网盘"],
  [/(?:[\w-]+\.)*(?:139\.com|feixin\.10086\.cn)/i, "移动云盘"],
  [/(?:aliyundrive|alipan)\.com/i, "阿里云盘"],
  [/cloud\.189\.cn/i, "天翼云盘"],
  [/115(?:cdn)?\.com/i, "115"],
  [/123(?:pan|684|865|912|592)\.(?:com|cn)/i, "123云盘"],
];

/** toast 话术 / 二维码标题里的 APP 名；识别不了就退回中性「对应网盘」 */
export function appNameOf(text?: string): string {
  if (!text) return "对应网盘";
  for (const [re, name] of APP_NAME_RULES) {
    if (re.test(text)) return name;
  }
  return "对应网盘";
}

/**
 * 通用口令（2026-09-16）：不认识的盘型一律用它，**不冒充任何平台**。
 * 各网盘的剪贴板识别统一认「链接：」标签，所以通用格式同样能被 APP 识别；
 * 末尾只提示「打开对应网盘 App」，把平台判断留给用户。
 */
function genericShareText(link: string, name: string, code: string): string {
  const lines: string[] = [];
  if (name) lines.push(`「${name}」`);
  lines.push(`链接：${link}`);
  if (code) lines.push(`提取码：${code}`);
  lines.push("复制链接后打开对应网盘 App 即可获取。");
  return lines.join("\n");
}

/**
 * 按盘型拼官方口令。裸 URL 的口令各 APP 剪贴板都识别不了，
 * 必须带「链接：」「提取码：」标签或官方话术。
 */
export function buildShareText(data: {
  share_url?: string;
  passcode?: string;
  name?: string;
}): string {
  const link = data.share_url || "";
  const name = (data.name || "").trim();
  const code = data.passcode || "";
  const driver = driverOf(link);

  // 百度：单行「链接：xxx 提取码：xxx」+ 官方提示语
  if (driver === "baidu") {
    const base = code ? `链接：${link} 提取码：${code}` : `链接：${link}`;
    return name
      ? `${base} 我用百度网盘分享了「${name}」，复制这段内容后打开百度网盘手机App，操作更方便哦`
      : base;
  }

  // 迅雷：链接带 ?pwd=xxx#（官方口令结尾带 #）+ 「手机迅雷 App」话术
  if (driver === "xunlei") {
    // 链接自带 pwd 时不再拼（原链接交付路径给的正是这种形态），也不再补 #：
    // 那本就是迅雷官方分享链接，APP 认得
    const linkWithPwd =
      code && !hasPwdParam(link)
        ? `${link}${link.includes("?") ? "&" : "?"}pwd=${code}#`
        : link;
    return `${linkWithPwd} 复制这段内容后打开「手机迅雷 App」即可获取。无需下载在线查看，视频原画享倍速播放`;
  }

  // UC：多行「来自UC网盘分享文件：」开头（2026-09-08 用户对照官方格式）
  if (driver === "uc") {
    const lines: string[] = ["来自UC网盘分享文件："];
    if (name) lines.push(`「${name}」`);
    lines.push("上传下载快，畅享原画播放和云解压，可电视投屏。点击链接立刻保存。");
    lines.push(`链接：${link}`);
    if (code) lines.push(`提取码：${code}`);
    return lines.join("\n");
  }

  // 夸克：官方多行格式（话术里的 APP 名必须是夸克本身，不能泛化）
  if (driver === "quark") {
    const head = name
      ? `我用夸克网盘给你分享了「${name}」，点击链接或复制整段内容，打开「夸克APP」即可获取。`
      : "点击链接或复制整段内容，打开「夸克APP」即可获取。";
    return code
      ? `${head}
链接：${link}
提取码：${code}`
      : `${head}
链接：${link}`;
  }

  // 其余盘型（115/天翼/阿里/123/139/磁力/未知站点…）：通用格式
  return genericShareText(link, name, code);
}

/**
 * 资源二维码内容（2026-09-21）
 *
 * 只放**裸链接**：整段分享口令带中文话术，字符数是裸链接的十倍以上，做出来
 * 是一张密到扫不动的码。截图对标的第三方站也是裸链接（pan.quark.cn/s/xxx）。
 *
 * 提取码只对「官方口令本身就是 ?pwd= 形态」的盘型拼进 query：百度/迅雷的分享
 * 链接天然吃 ?pwd= 自动带码；夸克现行是 url_type=1 公开分享（无码）；UC 链接上
 * 的 ?public=1 是公开标记而非提取码；其余盘型拼错参数反而可能打断 APP 对链接的
 * 识别。不拼码时提取码由弹窗文本另行展示，用户可手动输入。
 */
export function buildShareQrUrl(link: string, passcode?: string): string {
  const raw = (link || "").trim();
  if (!raw) return "";
  // 磁力不是可扫的网盘链接：手机扫出来没有应用接得住 magnet: 协议，
  // 给出码只会让人白扫一次（这类条目仍走原来的复制视图）
  if (/^magnet:/i.test(raw)) return "";
  const code = (passcode || "").trim();
  if (!code) return raw;
  // 链接自带提取码时直接用：原链接交付路径的 share_url 已带参数，
  // 再拼一次会得到 ?pwd=x&pwd=x（2026-09-21 线上实测：迅雷）
  if (hasPwdParam(raw)) return raw;
  const param = pwdParamOf(raw);
  if (!param) return raw;
  // 115 分享链接常以空 fragment 结尾（`https://115.com/s/xxx#`），query 必须落在 # 之前
  const url = raw.replace(/#+$/, "");
  return `${url}${url.includes("?") ? "&" : "?"}${param}=${code}`;
}
