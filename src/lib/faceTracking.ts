import {
  FilesetResolver,
  FaceLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { type FaceRelativePoint } from "../types";

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
export function getFaceTransform(lm: NormalizedLandmark[]): FaceTransform | null {
  if (!lm || lm.length < 264) return null;

  const nose = lm[4];
  const leftEye = lm[33];
  const rightEye = lm[263];

  if (!nose || !leftEye || !rightEye) return null;

  // Calculate eye-to-eye distance for scale
  const scale = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);

  // Calculate roll angle (Z-axis rotation)
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

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
): { x: number; y: number } {
  // Apply custom scale and offset in face-relative space
  const fx = pt.fx * customScale + offsetX;
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
