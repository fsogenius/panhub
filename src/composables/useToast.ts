import { readonly, ref } from "vue";

export type ToastType = "info" | "success" | "error";

export interface ToastState {
  show: boolean;
  message: string;
  type: ToastType;
}

const toast = ref<ToastState>({ show: false, message: "", type: "info" });
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function useToast() {
  function showToast(message: string, type: ToastType = "info", duration = 2500) {
    if (hideTimer) clearTimeout(hideTimer);
    toast.value = { show: true, message, type };
    hideTimer = setTimeout(() => {
      toast.value.show = false;
      hideTimer = null;
    }, duration);
  }

  return { toast: readonly(toast), showToast };
}
