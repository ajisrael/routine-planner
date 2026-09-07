import { useCallback, useRef } from "react";

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  /** True while a finished long-press should still swallow the trailing click. */
  suppressed: () => boolean;
}

/**
 * 450ms long-press for touch/pen that reports the pointer coordinates when it
 * fires (iOS Safari never dispatches contextmenu, so touch needs its own path
 * to right-click actions). Mouse pointers are ignored; a >10px move cancels.
 * After the press fires, the trailing click/pointerup is suppressed.
 */
export function useLongPress(open: (x: number, y: number) => void, ms = 450): LongPressHandlers {
  const state = useRef({ timer: null as number | null, x: 0, y: 0, suppressUntil: 0 });

  const cancel = useCallback((): void => {
    const s = state.current;
    if (s.timer != null) {
      window.clearTimeout(s.timer);
      s.timer = null;
    } else if (Date.now() < s.suppressUntil) {
      // The press already fired: the pointerup that ends it lands after an
      // arbitrary hold time, so refresh the click-suppression window.
      s.suppressUntil = Date.now() + 400;
    }
  }, []);

  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") return;
      cancel();
      state.current.x = e.clientX;
      state.current.y = e.clientY;
      state.current.timer = window.setTimeout(() => {
        state.current.timer = null;
        state.current.suppressUntil = Date.now() + 400;
        open(e.clientX, e.clientY);
      }, ms);
    },
    onPointerMove: (e) => {
      const s = state.current;
      if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    suppressed: () => Date.now() < state.current.suppressUntil,
  };
}

/** ContextMenuState expects a React.MouseEvent; long-press only has coords. */
export function syntheticContextEvent(x: number, y: number): React.MouseEvent {
  return {
    clientX: x,
    clientY: y,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as React.MouseEvent;
}
