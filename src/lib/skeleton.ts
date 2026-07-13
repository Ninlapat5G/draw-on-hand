import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { videoPointToCanvas } from "./tracking";

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // index
  [5, 9], [9, 10], [10, 11], [11, 12],   // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17],
];

/**
 * Draws the live hand skeleton so the user can see exactly what gesture the
 * tracker perceives. The thumb–index gap (the pinch that draws/clicks) is
 * emphasized with a connector line that lights up on contact.
 */
export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  videoW: number,
  videoH: number,
  w: number,
  h: number,
  accent: string,
  pinching: boolean,
) {
  const pts = landmarks.map((lm) =>
    videoPointToCanvas(lm.x, lm.y, videoW, videoH, w, h),
  );

  ctx.save();

  // Bones
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();

  // Joints
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  for (let i = 0; i < pts.length; i++) {
    if (i === 4 || i === 8) continue;
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Thumb–index connector: the gesture that matters.
  const thumb = pts[4];
  const index = pts[8];
  ctx.strokeStyle = pinching ? accent : "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = pinching ? 2.4 : 1.6;
  ctx.setLineDash(pinching ? [] : [4, 5]);
  ctx.beginPath();
  ctx.moveTo(thumb.x, thumb.y);
  ctx.lineTo(index.x, index.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Fingertips involved in the pinch, glowing in the tool color.
  ctx.shadowColor = accent;
  ctx.shadowBlur = pinching ? 14 : 8;
  ctx.fillStyle = accent;
  for (const tip of [thumb, index]) {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, pinching ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
