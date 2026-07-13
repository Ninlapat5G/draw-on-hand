export type BrushStyle = "pen" | "neon" | "marker" | "rainbow" | "eraser";

export interface Tool {
  style: BrushStyle;
  color: string;
  size: number;
}

export interface StrokePoint {
  /** normalized 0..1 relative to canvas width */
  x: number;
  /** normalized 0..1 relative to canvas height */
  y: number;
}

export interface Stroke {
  style: BrushStyle;
  color: string;
  size: number;
  points: StrokePoint[];
}

export type AppStatus =
  | "loading-model"
  | "starting-camera"
  | "ready"
  | "camera-denied"
  | "error";
