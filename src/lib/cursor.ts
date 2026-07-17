import type { Tool } from "../types";
import type { UiState } from "./handUi";

/**
 * Fingertip cursor: a ring that fills as the pinch closes, plus a gesture
 * readout chip. Every ring gets a dark under-stroke first so the cursor
 * stays visible on bright glass panels and light video backgrounds.
 */
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ui: UiState,
  pinching: boolean,
  strength: number,
  tool: Tool,
) {
  const color =
    ui.overUi || tool.style === "eraser"
      ? "rgba(255,255,255,0.95)"
      : tool.color;
  const radius = ui.overUi
    ? 11
    : Math.max(tool.size * 0.6, 7) + (1 - strength) * 8;

  const ring = (from: number, to: number, alpha: number) => {
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(8, 10, 16, 0.7)";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, from, to);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, radius, from, to);
    ctx.stroke();
    ctx.restore();
  };

  ctx.save();
  if (pinching) {
    ring(0, Math.PI * 2, 1);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(tool.size * 0.3, 3.5), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(8, 10, 16, 0.8)";
    ctx.shadowBlur = 5;
    ctx.fill();
  } else {
    // Faint full ring plus a bright arc showing pinch progress, so the
    // user can see how close their fingers are to registering a touch.
    ring(0, Math.PI * 2, 0.4);
    if (strength > 0.02) {
      ring(-Math.PI / 2, -Math.PI / 2 + strength * Math.PI * 2, 1);
    }
    // Center dot marking the exact selection point.
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(8, 10, 16, 0.8)";
    ctx.shadowBlur = 4;
    ctx.fill();
  }
  ctx.restore();

  // Gesture readout under the cursor, on a dark chip for readability.
  const label =
    ui.mode === "drag"
      ? "MOVE"
      : ui.mode === "slider"
        ? "ADJUST"
        : ui.overUi
          ? pinching
            ? "CLICK"
            : "HOVER"
          : pinching
            ? tool.style === "eraser"
              ? "ERASING"
              : tool.style === "laser"
                ? "LASER"
                : "DRAWING"
            : "";
  if (label) {
    ctx.save();
    ctx.font = '600 10px "Outfit", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    const cy = y + radius + 16;
    ctx.fillStyle = "rgba(8, 10, 16, 0.72)";
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - 7, cy - 9, tw + 14, 18, 9);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(label, x, cy);
    ctx.restore();
  }
}
