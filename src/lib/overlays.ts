/**
 * Live-layer overlay rendering: symmetry guides, AR-mask layers and their
 * edit handles, the mask-definition box, and laser-pointer trails. Pure
 * canvas drawing — no React, no state.
 */
import type { MaskLayer, SymmetryMode } from "../types";
import {
  faceRelativeToCanvas,
  getMaskBounds,
  getMaskHandles,
  type FaceTransform,
} from "./faceTracking";
import type { MaskDefBox } from "./maskDefBox";
import { drawStroke } from "./strokes";

/** Dashed axis lines showing where symmetric reflections land. */
export function drawSymmetryGuides(
  ctx: CanvasRenderingContext2D,
  sym: SymmetryMode,
  w: number,
  h: number,
) {
  if (sym === "off") return;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  if (sym === "kaleido") {
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Glowing cyan dot on the tracked nose tip (the mask anchor). */
export function drawNoseDot(
  ctx: CanvasRenderingContext2D,
  face: FaceTransform,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(face.x * w, face.y * h, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(34, 211, 238, 0.9)";
  ctx.shadowColor = "rgba(34, 211, 238, 0.8)";
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();
}

/** Renders one mask layer's strokes tracked onto the face. */
export function drawMaskLayer(
  ctx: CanvasRenderingContext2D,
  mask: MaskLayer,
  face: FaceTransform,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.globalAlpha = mask.opacity;
  for (const stroke of mask.strokes) {
    const points = stroke.points.map((pt) =>
      faceRelativeToCanvas(
        pt,
        face,
        mask.scale,
        mask.offsetX,
        mask.offsetY,
        mask.mirror,
      ),
    );
    drawStroke(
      ctx,
      { ...stroke, color: mask.colorOverride || stroke.color, points },
      w,
      h,
    );
  }
  ctx.restore();
}

/** Dashed bounding box + move/scale handles around the selected mask. */
export function drawSelectedMaskBox(
  ctx: CanvasRenderingContext2D,
  mask: MaskLayer,
  face: FaceTransform,
  w: number,
  h: number,
) {
  const bounds = getMaskBounds(mask.strokes);
  const handles = getMaskHandles(mask, face, w, h);
  if (!bounds || !handles) return;

  const project = (fx: number, fy: number) => {
    const p = faceRelativeToCanvas(
      { fx, fy },
      face,
      mask.scale,
      mask.offsetX,
      mask.offsetY,
      mask.mirror,
    );
    return { x: p.x * w, y: p.y * h };
  };
  const tl = project(bounds.minFx, bounds.minFy);
  const tr = project(bounds.maxFx, bounds.minFy);
  const br = project(bounds.maxFx, bounds.maxFy);
  const bl = project(bounds.minFx, bounds.maxFy);

  ctx.save();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.65)";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.stroke();

  // Move handle (bounds centre).
  ctx.beginPath();
  ctx.arc(handles.cx, handles.cy, 14, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(34, 211, 238, 0.25)";
  ctx.strokeStyle = "rgba(34, 211, 238, 0.95)";
  ctx.lineWidth = 2.2;
  ctx.setLineDash([]);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(handles.cx, handles.cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Scale handle (bottom-right corner).
  ctx.beginPath();
  ctx.arc(handles.sx, handles.sy, 12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(236, 72, 153, 0.25)";
  ctx.strokeStyle = "rgba(236, 72, 153, 0.95)";
  ctx.lineWidth = 2.2;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** The mask-definition box with its corner/move/anchor handles. */
export function drawDefOverlay(
  ctx: CanvasRenderingContext2D,
  box: MaskDefBox,
  hovered: string | null,
  w: number,
  h: number,
) {
  const x1 = (box.x - box.width / 2) * w;
  const x2 = (box.x + box.width / 2) * w;
  const y1 = (box.y - box.height / 2) * h;
  const y2 = (box.y + box.height / 2) * h;
  const ax = box.anchorX * w;
  const ay = box.anchorY * h;
  const cx = box.x * w;
  const cy = box.y * h;

  ctx.save();

  // Selection boundary (glowing orange).
  ctx.strokeStyle = "rgba(251, 146, 60, 0.75)";
  ctx.lineWidth = 2.2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.rect(x1, y1, x2 - x1, y2 - y1);
  ctx.stroke();

  // Corner handles; the one the fingertip is aiming at grows and glows.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  const corner = (hx: number, hy: number, id: string) => {
    const on = hovered === id;
    ctx.beginPath();
    ctx.arc(hx, hy, on ? 13 : 8, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#fdba74" : "#fb923c";
    if (on) {
      ctx.shadowColor = "#fb923c";
      ctx.shadowBlur = 16;
    }
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
  };
  corner(x1, y1, "resize-tl");
  corner(x2, y1, "resize-tr");
  corner(x1, y2, "resize-bl");
  corner(x2, y2, "resize-br");

  // Centre move handle.
  const boxOn = hovered === "move-box";
  ctx.beginPath();
  ctx.arc(cx, cy, boxOn ? 16 : 12, 0, Math.PI * 2);
  ctx.fillStyle = boxOn ? "rgba(251, 146, 60, 0.5)" : "rgba(251, 146, 60, 0.25)";
  ctx.strokeStyle = "#fb923c";
  ctx.lineWidth = 2;
  if (boxOn) {
    ctx.shadowColor = "#fb923c";
    ctx.shadowBlur = 16;
  }
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Custom nose-anchor handle (glowing yellow).
  const anchorOn = hovered === "move-anchor";
  ctx.beginPath();
  ctx.arc(ax, ay, anchorOn ? 16 : 12, 0, Math.PI * 2);
  ctx.fillStyle = anchorOn ? "rgba(250, 204, 21, 0.65)" : "rgba(250, 204, 21, 0.4)";
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 2.2;
  if (anchorOn) {
    ctx.shadowColor = "#facc15";
    ctx.shadowBlur = 18;
  }
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(ax, ay, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Labels.
  ctx.font = '600 11px "Outfit", "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#fb923c";
  ctx.textAlign = "center";
  ctx.fillText("ขอบเขตหน้ากาก (DRAG CORNERS)", cx, y1 - 12);
  ctx.fillStyle = "#facc15";
  ctx.textAlign = "left";
  ctx.fillText("จุดยึดจมูก (NOSE ANCHOR)", ax + 18, ay + 4);

  ctx.restore();
}

export interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

/** Fading glowing laser-pointer trail. */
export function drawLaserTrail(
  ctx: CanvasRenderingContext2D,
  trail: LaserPoint[],
  color: string,
  size: number,
  now: number,
  ttl: number,
) {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const alpha = Math.max(0, 1 - (now - b.t) / ttl);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size * 0.7) * (0.35 + 0.65 * alpha);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}
