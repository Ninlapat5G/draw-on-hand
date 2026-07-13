import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";

export interface HandFrame {
  /** pointer position, normalized to the video frame (not yet mirrored) */
  x: number;
  y: number;
  pinching: boolean;
  /** 0 = open, 1 = fingertips touching */
  pinchStrength: number;
}

/** User-tunable pinch settings, shared by every hand's engine. */
export interface PinchConfig {
  /** 2D thumb–index gap / hand size at which contact registers. */
  ratioStart: number;
}

export const DEFAULT_PINCH_RATIO = 0.35;
export const MIN_PINCH_RATIO = 0.18;
export const MAX_PINCH_RATIO = 0.55;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 0 when at/above the release threshold, 1 when at/below the touch one. */
function progress(value: number, start: number, end: number): number {
  return clamp((end - value) / (end - start), 0, 1);
}

/**
 * Turns raw hand landmarks into a stable pointer + pinch state.
 *
 * A pinch only registers when the thumb and index fingertips are at the SAME
 * physical point, verified two independent ways that must BOTH agree:
 *
 * 1. 3D world distance (meters, from MediaPipe's world landmarks) — the true
 *    tip-to-tip gap. This rejects the classic false positive where a tilted
 *    hand makes the tips overlap in the 2D camera image while they are
 *    actually apart in depth.
 * 2. 2D screen distance relative to the hand's own size — a backup gate that
 *    rejects world-landmark noise.
 *
 * The contact must also hold for a few consecutive frames, and releasing
 * requires clearly separating (hysteresis on both measures), so hover and
 * click are unambiguous: near-touches never click, held pinches never drop.
 */
export class GestureEngine {
  private smoothX = 0;
  private smoothY = 0;
  private hasPrev = false;
  private pinching = false;
  private touchFrames = 0;

  /** Consecutive frames of contact required before a pinch registers. */
  private static readonly TOUCH_FRAMES = 2;

  /** The config object is shared and mutable — the settings panel adjusts it
   * live and every hand's engine picks the new thresholds up next frame. */
  constructor(private readonly config: PinchConfig) {}

  update(lm: NormalizedLandmark[], world?: Landmark[]): HandFrame {
    // 2D thumb–index distance / hand size (wrist→middle-MCP), user-tunable.
    const ratioStart = this.config.ratioStart;
    const ratioEnd = ratioStart + 0.16;
    // 3D tip-to-tip distance in meters, scaled with the user setting. Loose
    // on purpose: it only exists to reject depth-separated fingers that
    // merely overlap in the 2D image — the 2D ratio is the primary gate.
    const distStart = 0.045 * (ratioStart / DEFAULT_PINCH_RATIO);
    const distEnd = distStart + 0.025;
    const thumb = lm[4];
    const index = lm[8];
    const wrist = lm[0];
    const middleMcp = lm[9];

    const handScale = Math.max(
      Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y),
      1e-6,
    );
    const ratio =
      Math.hypot(thumb.x - index.x, thumb.y - index.y) / handScale;

    // True 3D fingertip gap. If world landmarks are ever missing, mirror the
    // 2D measure so the AND-gate degrades to ratio-only instead of locking.
    let worldDist = ratio * 0.09;
    if (world && world.length > 8) {
      const t = world[4];
      const i = world[8];
      worldDist = Math.hypot(t.x - i.x, t.y - i.y, t.z - i.z);
    }

    const touching = ratio < ratioStart && worldDist < distStart;
    const separated = ratio > ratioEnd || worldDist > distEnd;

    if (!this.pinching) {
      if (touching) {
        this.touchFrames++;
        if (this.touchFrames >= GestureEngine.TOUCH_FRAMES) {
          this.pinching = true;
        }
      } else {
        this.touchFrames = 0;
      }
    } else if (separated) {
      this.pinching = false;
      this.touchFrames = 0;
    }

    // Strength = the weaker of the two contact measures, so the progress
    // ring only fills when the tips are genuinely converging in 3D too.
    const pinchStrength = Math.min(
      progress(ratio, ratioStart, ratioEnd),
      progress(worldDist, distStart, distEnd),
    );

    // The perceived "pen tip" is between the thumb and index finger.
    const rawX = (thumb.x + index.x) / 2;
    const rawY = (thumb.y + index.y) / 2;

    if (!this.hasPrev) {
      this.smoothX = rawX;
      this.smoothY = rawY;
      this.hasPrev = true;
    } else {
      const speed = Math.hypot(rawX - this.smoothX, rawY - this.smoothY);
      const alpha = clamp(0.2 + speed * 18, 0.2, 0.85);
      this.smoothX += (rawX - this.smoothX) * alpha;
      this.smoothY += (rawY - this.smoothY) * alpha;
    }

    return {
      x: this.smoothX,
      y: this.smoothY,
      pinching: this.pinching,
      pinchStrength,
    };
  }

  reset() {
    this.hasPrev = false;
    this.pinching = false;
    this.touchFrames = 0;
  }
}
