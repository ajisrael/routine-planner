/**
 * Mobile on-screen keyboard tracking (DESIGN.md §5.2 dialogs).
 *
 * The virtual keyboard overlays the layout viewport on iOS (and older
 * Android): fixed-position dialogs keep centering in the full-height
 * viewport, so their lower half is hidden behind the keyboard. This module
 * exposes the visual viewport (the part not covered by the keyboard) as CSS
 * variables and toggles `kb-open` on <html> once the keyboard overlaps
 * meaningfully; styles.css then top-aligns `.modal-box` inside the visible
 * slice so forms and pickers stay interactive while typing.
 *
 * On Android Chrome, `interactive-widget=resizes-content` (index.html) shrinks
 * the layout viewport instead, so innerHeight already tracks the visible
 * area: the computed keyboard height stays ~0 and the default centering
 * keeps working.
 */

/** Below this overlap, treat viewport changes as toolbars/rotation, not keyboard. */
const KEYBOARD_THRESHOLD = 150;

export function initKeyboardTracking(): void {
  const vv = window.visualViewport;
  if (!vv) return;

  const update = (): void => {
    const root = document.documentElement;
    const visibleH = Math.round(vv.height);
    const overlap = Math.max(0, Math.round(window.innerHeight - vv.height));
    root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
    root.style.setProperty("--vv-h", `${visibleH}px`);
    root.classList.toggle("kb-open", overlap > KEYBOARD_THRESHOLD);
  };

  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  window.addEventListener("orientationchange", update);
  update();
}
