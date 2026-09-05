import { create } from "zustand";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, text: string, timeoutMs?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text, timeoutMs = 4200) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, timeoutMs);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (text: string): void => useToastStore.getState().push("info", text),
  success: (text: string): void => useToastStore.getState().push("success", text),
  warning: (text: string): void => useToastStore.getState().push("warning", text, 6000),
  error: (text: string): void => useToastStore.getState().push("error", text, 6000),
};
