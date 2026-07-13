import type { Stroke, StrokePoint } from "../types";

interface Pt {
  x: number;
  y: number;
}

function toPixels(points: StrokePoint[], w: number, h: number): Pt[] {
  return points.map((p) => ({ x: p.x * w, y: p.y * h }));
}

/** Smooth polyline through the points using midpoint quadratic curves. */
function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  pt: Pt,
  radius: number,
  fill: string,
) {
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Renders one full stroke onto the given context (working in CSS pixels).
 * Called every frame for the in-progress stroke and once per stroke on
 * commit/replay, so alpha-based styles like the marker stay uniform.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
  const pts = toPixels(stroke.points, w, h);
  if (pts.length === 0) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (stroke.style) {
    case "pen": {
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size / 2, stroke.color);
        break;
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      tracePath(ctx, pts);
      ctx.stroke();
      break;
    }

    case "marker": {
      ctx.globalAlpha = 0.45;
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size * 0.9, stroke.color);
        break;
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size * 1.8;
      tracePath(ctx, pts);
      ctx.stroke();
      break;
    }

    case "neon": {
      if (pts.length === 1) {
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = stroke.size * 1.6;
        drawDot(ctx, pts[0], stroke.size / 2, stroke.color);
        ctx.shadowBlur = 0;
        drawDot(ctx, pts[0], stroke.size * 0.18, "rgba(255,255,255,0.95)");
        break;
      }
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = stroke.size * 1.6;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      tracePath(ctx, pts);
      ctx.stroke();
      // Draw the glow twice for intensity, then a bright core.
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = Math.max(stroke.size * 0.35, 1);
      ctx.stroke();
      break;
    }

    case "rainbow": {
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size / 2, "hsl(0 95% 60%)");
        break;
      }
      ctx.lineWidth = stroke.size;
      for (let i = 1; i < pts.length; i++) {
        const hue = (i * 5) % 360;
        ctx.strokeStyle = `hsl(${hue} 95% 60%)`;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      break;
    }

    case "eraser": {
      ctx.globalCompositeOperation = "destination-out";
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size * 1.1, "#000");
        break;
      }
      ctx.strokeStyle = "#000";
      ctx.lineWidth = stroke.size * 2.2;
      tracePath(ctx, pts);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

/**
 * Incrementally erases the segment between the last two points of an eraser
 * stroke. Erasing has to hit the committed layer immediately (you can't
 * preview an erase on an overlay), and destination-out re-application is
 * idempotent so overlapping segments are safe.
 */
export function eraseSegment(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
  const n = stroke.points.length;
  if (n === 0) return;
  const pts = toPixels(stroke.points.slice(Math.max(0, n - 2)), w, h);

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pts.length === 1) {
    drawDot(ctx, pts[0], stroke.size * 1.1, "#000");
  } else {
    ctx.strokeStyle = "#000";
    ctx.lineWidth = stroke.size * 2.2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
  }
  ctx.restore();
}
