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

/** Deterministic pseudo-random in [0, 1) so spray dots land in the same spot
 * on every replay/undo redraw instead of shimmering. */
function pseudoRandom(seed: number): number {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// ---------- Symmetry ----------

/** Mirror across the vertical center line of the canvas. */
function mirrorPoints(points: StrokePoint[]): StrokePoint[] {
  return points.map((p) => ({ x: 1 - p.x, y: p.y }));
}

/** Rotate normalized points around the canvas center in PIXEL space so the
 * rotation stays circular on non-square canvases. */
function rotatePoints(
  points: StrokePoint[],
  angle: number,
  w: number,
  h: number,
): StrokePoint[] {
  const cx = w / 2;
  const cy = h / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map((p) => {
    const px = p.x * w - cx;
    const py = p.y * h - cy;
    return {
      x: (px * cos - py * sin + cx) / w,
      y: (px * sin + py * cos + cy) / h,
    };
  });
}

/** All point-sets a stroke renders as, honoring its symmetry mode. */
function symmetryVariants(
  stroke: Stroke,
  w: number,
  h: number,
): StrokePoint[][] {
  if (stroke.sym === "mirror") {
    return [stroke.points, mirrorPoints(stroke.points)];
  }
  if (stroke.sym === "kaleido") {
    return [0, 1, 2, 3].map((k) =>
      k === 0 ? stroke.points : rotatePoints(stroke.points, (k * Math.PI) / 2, w, h),
    );
  }
  return [stroke.points];
}

// ---------- Rendering ----------

/**
 * Renders one full stroke onto the given context (working in CSS pixels).
 * Called every frame for the in-progress stroke and once per stroke on
 * commit/replay, so alpha-based styles like the marker stay uniform.
 * Symmetric strokes render every reflection here so replay/undo/save all
 * stay consistent for free.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
  for (const points of symmetryVariants(stroke, w, h)) {
    renderStroke(ctx, stroke, points, w, h);
  }
}

function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  w: number,
  h: number,
) {
  const pts = toPixels(points, w, h);
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

    case "calligraphy": {
      // Width follows hand speed: slow deliberate moves lay thick ink,
      // fast sweeps thin out — the feel of a real nib.
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size * 0.8, stroke.color);
        break;
      }
      ctx.strokeStyle = stroke.color;
      for (let i = 1; i < pts.length; i++) {
        const dist = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        const width = Math.min(
          stroke.size * 1.8,
          Math.max(stroke.size * 0.25, stroke.size * 1.8 - dist * 0.6),
        );
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
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

    case "neon":
    case "laser": {
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

    case "dotted": {
      // Evenly spaced beads along the path, independent of hand speed.
      const spacing = Math.max(stroke.size * 2.4, 10);
      const radius = Math.max(stroke.size * 0.45, 2);
      ctx.fillStyle = stroke.color;
      drawDot(ctx, pts[0], radius, stroke.color);
      let carried = 0;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        const segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        if (segLen === 0) continue;
        let d = spacing - carried;
        while (d <= segLen) {
          const t = d / segLen;
          drawDot(
            ctx,
            { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t },
            radius,
            stroke.color,
          );
          d += spacing;
        }
        carried = segLen - (d - spacing);
      }
      break;
    }

    case "spray": {
      // Airbrush: a cloud of deterministic dots around each sampled point.
      const reach = stroke.size * 1.5;
      const count = Math.min(34, Math.max(10, Math.round(stroke.size * 1.2)));
      ctx.fillStyle = stroke.color;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < pts.length; i++) {
        for (let j = 0; j < count; j++) {
          const seed = i * 97 + j;
          const angle = pseudoRandom(seed) * Math.PI * 2;
          const rad = Math.sqrt(pseudoRandom(seed + 1)) * reach;
          const size = 0.6 + pseudoRandom(seed + 2) * 1.3;
          ctx.beginPath();
          ctx.arc(
            pts[i].x + Math.cos(angle) * rad,
            pts[i].y + Math.sin(angle) * rad,
            size,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      break;
    }

    case "line": {
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size / 2, stroke.color);
        break;
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      break;
    }

    case "arrow": {
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size / 2, stroke.color);
        break;
      }
      const a = pts[0];
      const b = pts[pts.length - 1];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head = Math.max(stroke.size * 2.6, 14);
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(
        b.x - head * Math.cos(angle - Math.PI / 6),
        b.y - head * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(
        b.x - head * Math.cos(angle + Math.PI / 6),
        b.y - head * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
      break;
    }

    case "rect": {
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size / 2, stroke.color);
        break;
      }
      const a = pts[0];
      const b = pts[pts.length - 1];
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.strokeRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
      );
      break;
    }

    case "ellipse": {
      if (pts.length === 1) {
        drawDot(ctx, pts[0], stroke.size / 2, stroke.color);
        break;
      }
      const a = pts[0];
      const b = pts[pts.length - 1];
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.max(Math.abs(b.x - a.x) / 2, 1),
        Math.max(Math.abs(b.y - a.y) / 2, 1),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
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
 * idempotent so overlapping segments are safe. Honors the stroke's symmetry
 * so mirrored artwork erases symmetrically too.
 */
export function eraseSegment(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
  const n = stroke.points.length;
  if (n === 0) return;
  const tail: Stroke = {
    ...stroke,
    points: stroke.points.slice(Math.max(0, n - 2)),
  };

  for (const points of symmetryVariants(tail, w, h)) {
    const pts = toPixels(points, w, h);
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
}
