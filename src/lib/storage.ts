import type { MaskLayer, Stroke } from "../types";
import {
  DEFAULT_PINCH_RATIO,
  MAX_PINCH_RATIO,
  MIN_PINCH_RATIO,
} from "./gestures";

/** Every localStorage key the app uses, in one place. */
export const STORAGE_KEYS = {
  pinchRatio: "draw-on-hand.pinchRatio",
  drawingHand: "draw-on-hand.drawingHand",
  onboarded: "draw-on-hand.onboarded",
  artwork: "draw-on-hand.artwork",
  masks: "draw-on-hand.masks",
} as const;

/** localStorage can throw (privacy mode, quota) — every access is guarded. */
export function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

export function loadString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort
  }
}

export function loadPinchRatio(): number {
  const stored = loadString(STORAGE_KEYS.pinchRatio);
  if (stored === null) return DEFAULT_PINCH_RATIO;
  const raw = Number(stored);
  if (!Number.isFinite(raw)) return DEFAULT_PINCH_RATIO;
  return Math.min(MAX_PINCH_RATIO, Math.max(MIN_PINCH_RATIO, raw));
}

export function loadDrawingHand(): "Left" | "Right" {
  const stored = loadString(STORAGE_KEYS.drawingHand);
  return stored === "Left" || stored === "Right" ? stored : "Right";
}

export function loadSavedMasks(): MaskLayer[] {
  const data = loadJson<MaskLayer[]>(STORAGE_KEYS.masks);
  return Array.isArray(data) ? data : [];
}

export function loadSavedStrokes(): Stroke[] {
  const data = loadJson<Stroke[]>(STORAGE_KEYS.artwork);
  return Array.isArray(data) ? data : [];
}
