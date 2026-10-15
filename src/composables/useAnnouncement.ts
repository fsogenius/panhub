/**
 * 顶部公告条：内容来自官方 /api/announcement（无需登录）。
 * 关闭状态按版本号记忆，后台改公告后版本号 +1，已关闭用户会重新看到。
 */
import { ref } from "vue";
import { apiGet } from "../api/client";

export interface AnnouncementItem {
  id: string;
  text: string;
  link?: string;
}

interface AnnouncementPayload {
  version: number;
  items: AnnouncementItem[];
}

const DISMISS_KEY_PREFIX = "panhub:announcement-dismissed:v";

export function useAnnouncement() {
  const items = ref<AnnouncementItem[]>([]);
  const version = ref(0);
  const visible = ref(false);

  async function load(): Promise<void> {
    let data: AnnouncementPayload | null = null;
    try {
      const res = await apiGet<{ code: number; data: AnnouncementPayload }>(
        "/announcement"
      );
      if (res?.code === 0 && Array.isArray(res.data?.items) && res.data.items.length > 0) {
        data = res.data;
      }
    } catch {}
    if (!data) return;

    items.value = data.items;
    version.value = data.version;
    try {
      if (localStorage.getItem(`${DISMISS_KEY_PREFIX}${data.version}`)) return;
    } catch {}
    visible.value = true;
  }

  function dismiss(): void {
    visible.value = false;
    try {
      localStorage.setItem(`${DISMISS_KEY_PREFIX}${version.value}`, "1");
    } catch {}
  }

  return { items, visible, load, dismiss };
}
