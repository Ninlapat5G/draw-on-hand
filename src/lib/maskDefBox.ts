/**
 * Geometry for the mask-definition box: the draggable/resizable region (plus
 * nose-anchor point) shown while baking a drawing into a face mask. Shared by
 * the mouse handlers and the hand-gesture interceptors so both input paths
 * stay pixel-identical.
 */

/** Which handle of the mask-definition box an interaction targets. */
export type DefEditMode =
  | "idle"
  | "move-box"
  | "move-anchor"
  | "resize-tl"
  | "resize-tr"
  | "resize-bl"
  | "resize-br";

/** The box itself, in normalized (0..1) canvas coordinates. */
export interface MaskDefBox {
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

/** Box + anchor captured when an edit starts; deltas apply to this snapshot. */
export interface DefEditSnapshot {
  mode: DefEditMode;
  startBoxX: number;
  startBoxY: number;
  startBoxW: number;
  startBoxH: number;
  startAnchorX: number;
  startAnchorY: number;
}

/** Smallest box edge, normalized. */
const MIN_SIZE = 0.05;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function snapshotDefEdit(
  mode: DefEditMode,
  box: MaskDefBox,
): DefEditSnapshot {
  return {
    mode,
    startBoxX: box.x,
    startBoxY: box.y,
    startBoxW: box.width,
    startBoxH: box.height,
    startAnchorX: box.anchorX,
    startAnchorY: box.anchorY,
  };
}

/**
 * The handle at (px, py) canvas pixels, or "idle". The anchor is tested first
 * (it can sit on top of the box centre) so it wins ties.
 */
export function pickDefHandle(
  px: number,
  py: number,
  box: MaskDefBox,
  w: number,
  h: number,
  radius: number,
): DefEditMode {
  const x1 = (box.x - box.width / 2) * w;
  const x2 = (box.x + box.width / 2) * w;
  const y1 = (box.y - box.height / 2) * h;
  const y2 = (box.y + box.height / 2) * h;
  const dist = (hx: number, hy: number) => Math.hypot(px - hx, py - hy);

  if (dist(box.anchorX * w, box.anchorY * h) < radius) return "move-anchor";
  if (dist(box.x * w, box.y * h) < radius) return "move-box";
  if (dist(x1, y1) < radius) return "resize-tl";
  if (dist(x2, y1) < radius) return "resize-tr";
  if (dist(x1, y2) < radius) return "resize-bl";
  if (dist(x2, y2) < radius) return "resize-br";
  return "idle";
}

/**
 * Applies a normalized drag delta (dx, dy) to the edit snapshot and returns
 * the resulting box updates, or null when the mode is "idle". Moving the box
 * carries the anchor along; resizing pins the opposite corner.
 */
export function applyDefEdit(
  edit: DefEditSnapshot,
  dx: number,
  dy: number,
): Partial<MaskDefBox> | null {
  if (edit.mode === "idle") return null;

  if (edit.mode === "move-anchor") {
    return {
      anchorX: clamp(edit.startAnchorX + dx, 0, 1),
      anchorY: clamp(edit.startAnchorY + dy, 0, 1),
    };
  }

  if (edit.mode === "move-box") {
    const newCx = clamp(edit.startBoxX + dx, 0, 1);
    const newCy = clamp(edit.startBoxY + dy, 0, 1);
    return {
      x: newCx,
      y: newCy,
      anchorX: clamp(edit.startAnchorX + (newCx - edit.startBoxX), 0, 1),
      anchorY: clamp(edit.startAnchorY + (newCy - edit.startBoxY), 0, 1),
    };
  }

  // Resize: move the grabbed corner, keep the opposite edges fixed.
  const l0 = edit.startBoxX - edit.startBoxW / 2;
  const r0 = edit.startBoxX + edit.startBoxW / 2;
  const t0 = edit.startBoxY - edit.startBoxH / 2;
  const b0 = edit.startBoxY + edit.startBoxH / 2;

  let left = l0;
  let right = r0;
  let top = t0;
  let bottom = b0;

  if (edit.mode === "resize-tl" || edit.mode === "resize-bl") {
    left = clamp(l0 + dx, 0, r0 - MIN_SIZE);
  } else {
    right = clamp(r0 + dx, l0 + MIN_SIZE, 1);
  }
  if (edit.mode === "resize-tl" || edit.mode === "resize-tr") {
    top = clamp(t0 + dy, 0, b0 - MIN_SIZE);
  } else {
    bottom = clamp(b0 + dy, t0 + MIN_SIZE, 1);
  }

  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}
