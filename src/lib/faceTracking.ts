import {
  FilesetResolver,
  FaceLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { type FaceRelativePoint, type MaskStroke } from "../types";
import { videoPointToCanvas } from "./tracking";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export interface FaceTransform {
  /** nose tip x, y in normalized coordinates (0..1) */
  x: number;
  y: number;
  /** eye-to-eye distance (represents face scale) */
  scale: number;
  /** roll angle of the head in radians */
  angle: number;
}

/**
 * Calculates a stable face transform from the face landmarks.
 * Index 4 is nose tip.
 * Index 33 is left eye outer corner.
 * Index 263 is right eye outer corner.
 */
export function getFaceTransform(
  lm: NormalizedLandmark[],
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
): FaceTransform | null {
  if (!lm || lm.length < 264) return null;

  const rawNose = lm[4];
  const rawLeftEye = lm[33];
  const rawRightEye = lm[263];
  const rawForehead = lm[10];
  const rawChin = lm[152];

  if (!rawNose || !rawLeftEye || !rawRightEye || !rawForehead || !rawChin) return null;

  // Map raw landmarks from video coordinates to cover-fit canvas space
  const nosePt = videoPointToCanvas(rawNose.x, rawNose.y, videoW, videoH, canvasW, canvasH);
  const leftPt = videoPointToCanvas(rawLeftEye.x, rawLeftEye.y, videoW, videoH, canvasW, canvasH);
  const rightPt = videoPointToCanvas(rawRightEye.x, rawRightEye.y, videoW, videoH, canvasW, canvasH);
  const foreheadPt = videoPointToCanvas(rawForehead.x, rawForehead.y, videoW, videoH, canvasW, canvasH);
  const chinPt = videoPointToCanvas(rawChin.x, rawChin.y, videoW, videoH, canvasW, canvasH);

  // Normalize mapped coordinates back relative to canvas width and height
  const nose = { x: nosePt.x / canvasW, y: nosePt.y / canvasH };
  const leftEye = { x: leftPt.x / canvasW, y: leftPt.y / canvasH };
  const rightEye = { x: rightPt.x / canvasW, y: rightPt.y / canvasH };
  const forehead = { x: foreheadPt.x / canvasW, y: foreheadPt.y / canvasH };
  const chin = { x: chinPt.x / canvasW, y: chinPt.y / canvasH };

  // Calculate width scale (eye-to-eye) and height scale (forehead-to-chin)
  const widthScale = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  const heightScale = Math.hypot(chin.x - forehead.x, chin.y - forehead.y);

  // Average width and height scales for a stable full-face scale multiplier
  const scale = (widthScale + heightScale) / 2;

  // Calculate roll angle (Z-axis rotation) using eye coordinates on canvas
  // Since leftEye.x on canvas is on the right side and rightEye.x is on the left,
  // we point the direction vector from rightEye (left side) to leftEye (right side)
  // to get the correct 0-centered angle on the screen canvas.
  const angle = Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x);

  return {
    x: nose.x,
    y: nose.y,
    scale: Math.max(scale, 1e-6),
    angle,
  };
}

/**
 * Calculates how open the mouth is, normalized by the face scale (eye-to-eye distance).
 * Index 13 is the inner top lip center.
 * Index 14 is the inner bottom lip center.
 */
export function getMouthOpenRatio(
  lm: NormalizedLandmark[],
  transform: FaceTransform,
): number {
  if (!lm || lm.length < 15 || !transform) return 0;
  const topLip = lm[13];
  const bottomLip = lm[14];
  if (!topLip || !bottomLip) return 0;

  const dist = Math.hypot(bottomLip.x - topLip.x, bottomLip.y - topLip.y);
  return dist / transform.scale;
}


/**
 * Converts a normalized canvas point {x, y} to a face-relative point {fx, fy}
 */
export function canvasToFaceRelative(
  x: number,
  y: number,
  face: FaceTransform,
): FaceRelativePoint {
  // Translate relative to nose tip
  const dx = x - face.x;
  const dy = y - face.y;

  // Rotate opposite of face angle (un-rotate)
  const cos = Math.cos(-face.angle);
  const sin = Math.sin(-face.angle);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  // Normalize by face scale
  return {
    fx: rx / face.scale,
    fy: ry / face.scale,
  };
}

/**
 * Transforms a face-relative point {fx, fy} back to normalized canvas coordinates {x, y}
 * applying optional customization properties.
 */
export function faceRelativeToCanvas(
  pt: FaceRelativePoint,
  face: FaceTransform,
  customScale = 1.0,
  offsetX = 0.0,
  offsetY = 0.0,
  mirror = false,
): { x: number; y: number } {
  // Apply custom scale and offset in face-relative space
  const fx = (pt.fx * (mirror ? -1 : 1)) * customScale + offsetX;
  const fy = pt.fy * customScale + offsetY;

  // Scale back up to canvas
  const sx = fx * face.scale;
  const sy = fy * face.scale;

  // Rotate by face angle
  const cos = Math.cos(face.angle);
  const sin = Math.sin(face.angle);
  const rx = sx * cos - sy * sin;
  const ry = sx * sin + sy * cos;

  // Translate back to nose tip
  return {
    x: rx + face.x,
    y: ry + face.y,
  };
}

export interface MaskBounds {
  minFx: number;
  maxFx: number;
  minFy: number;
  maxFy: number;
  centerX: number;
  centerY: number;
}

export function getMaskBounds(strokes: MaskStroke[]): MaskBounds | null {
  if (!strokes || strokes.length === 0) return null;
  let minFx = Infinity;
  let maxFx = -Infinity;
  let minFy = Infinity;
  let maxFy = -Infinity;

  let hasPoints = false;
  for (const s of strokes) {
    for (const p of s.points) {
      hasPoints = true;
      if (p.fx < minFx) minFx = p.fx;
      if (p.fx > maxFx) maxFx = p.fx;
      if (p.fy < minFy) minFy = p.fy;
      if (p.fy > maxFy) maxFy = p.fy;
    }
  }

  if (!hasPoints) return null;

  return {
    minFx,
    maxFx,
    minFy,
    maxFy,
    centerX: (minFx + maxFx) / 2,
    centerY: (minFy + maxFy) / 2,
  };
}
