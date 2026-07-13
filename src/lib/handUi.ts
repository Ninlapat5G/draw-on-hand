export type UiMode = "idle" | "hover" | "press" | "slider" | "drag";

export interface UiState {
  /** true while the pointer is over any UI surface (drawing must pause) */
  overUi: boolean;
  mode: UiMode;
  /** id of the panel being dragged (from data-drag), while mode === "drag" */
  dragId?: string;
  dragDx?: number;
  dragDy?: number;
}

const INTERACTIVE_SELECTOR = "button, input, label";
const UI_CONTAINER_SELECTOR =
  ".dock, .topbar, .actions-panel, .save-menu, .overlay-card";

/** How far (px) the pointer may drift off a control before hover drops. */
const STICKY_MARGIN = 16;

/** Cheap side-effect-free test used for hands that are NOT driving the UI
 * this frame (e.g. the second hand), so they still can't draw over panels. */
export function isOverUi(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  return !!el?.closest(UI_CONTAINER_SELECTOR);
}

/** Total movement (px) below which a pinch-drag release counts as a click. */
const TAP_THRESHOLD = 10;

/**
 * Lets the tracked fingertip operate the on-screen UI: hovering highlights
 * controls, a pinch clicks them, pinch-dragging the size slider adjusts it,
 * and pinch-dragging any element marked with data-drag moves its panel.
 * Works through elementFromPoint so it needs no changes to the React
 * components themselves.
 */
export class HandUiController {
  private hovered: HTMLElement | null = null;
  private slider: HTMLInputElement | null = null;
  private dragEl: HTMLElement | null = null;
  private dragId = "";
  private dragLastX = 0;
  private dragLastY = 0;
  private dragTotal = 0;
  private wasPinching = false;

  update(x: number, y: number, pinching: boolean): UiState {
    const justPinched = pinching && !this.wasPinching;
    this.wasPinching = pinching;

    // A panel grab persists until the pinch is released.
    if (this.dragEl) {
      if (pinching) {
        const dx = x - this.dragLastX;
        const dy = y - this.dragLastY;
        this.dragLastX = x;
        this.dragLastY = y;
        this.dragTotal += Math.hypot(dx, dy);
        return {
          overUi: true,
          mode: "drag",
          dragId: this.dragId,
          dragDx: dx,
          dragDy: dy,
        };
      }
      // Released: a pinch that barely moved is a click (e.g. toggling the
      // dock hub), a real drag just ends.
      const el = this.dragEl;
      this.dragEl = null;
      if (this.dragTotal < TAP_THRESHOLD) this.press(el);
    }

    // A slider grab persists until the pinch is released, even if the
    // pointer drifts off the control mid-drag.
    if (this.slider) {
      if (pinching) {
        this.applySlider(x);
        return { overUi: true, mode: "slider" };
      }
      this.slider = null;
    }

    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const container = el?.closest(UI_CONTAINER_SELECTOR) ?? null;
    let interactive = container
      ? ((el?.closest(INTERACTIVE_SELECTOR) as HTMLElement | null) ?? null)
      : null;

    // Sticky hover: if the pointer isn't directly on a control but is still
    // within a small margin of the last hovered one, keep that selection.
    // Hand jitter (especially the shift caused by the pinch motion itself)
    // then can't knock the target off right before the click lands.
    if (!interactive && this.hovered?.isConnected) {
      const r = this.hovered.getBoundingClientRect();
      if (
        x >= r.left - STICKY_MARGIN &&
        x <= r.right + STICKY_MARGIN &&
        y >= r.top - STICKY_MARGIN &&
        y <= r.bottom + STICKY_MARGIN
      ) {
        interactive = this.hovered;
      }
    }

    this.setHovered(interactive);

    if (!container && !interactive) {
      return { overUi: false, mode: "idle" };
    }

    if (justPinched) {
      // Movable panels: pinch-hold a [data-drag] handle and move the hand.
      const draggable = (el?.closest("[data-drag]") ??
        interactive?.closest("[data-drag]")) as HTMLElement | null;
      if (draggable) {
        this.dragEl = draggable;
        this.dragId = draggable.dataset.drag ?? "";
        this.dragLastX = x;
        this.dragLastY = y;
        this.dragTotal = 0;
        return { overUi: true, mode: "drag", dragId: this.dragId };
      }
      if (interactive instanceof HTMLInputElement && interactive.type === "range") {
        this.slider = interactive;
        this.applySlider(x);
        return { overUi: true, mode: "slider" };
      }
      if (interactive && !this.isDisabled(interactive)) {
        this.press(interactive);
        return { overUi: true, mode: "press" };
      }
    }

    return {
      overUi: true,
      mode: pinching ? "press" : "hover",
    };
  }

  reset() {
    this.setHovered(null);
    this.slider = null;
    this.dragEl = null;
    this.wasPinching = false;
  }

  /** True while a drag or slider grab is in progress — the hand that
   * started it must keep driving the controller until release. */
  isEngaged(): boolean {
    return this.dragEl !== null || this.slider !== null;
  }

  /** Drop hover feedback without touching drag/slider state, for frames
   * where no hand is over the UI. */
  clearHover() {
    this.setHovered(null);
    this.wasPinching = false;
  }

  private isDisabled(el: HTMLElement): boolean {
    return el instanceof HTMLButtonElement && el.disabled;
  }

  private setHovered(el: HTMLElement | null) {
    if (el === this.hovered) return;
    this.hovered?.classList.remove("hand-hover");
    this.hovered = el;
    this.hovered?.classList.add("hand-hover");
  }

  private press(el: HTMLElement) {
    el.classList.add("hand-press");
    window.setTimeout(() => el.classList.remove("hand-press"), 240);
    el.click();
  }

  private applySlider(x: number) {
    const input = this.slider;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    if (rect.width === 0) return;
    const t = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Math.round(min + t * (max - min));
    if (Number(input.value) === value) return;
    // Set through the native setter + input event so React's controlled
    // component sees the change.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
