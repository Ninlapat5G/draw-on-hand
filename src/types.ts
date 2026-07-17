export type BrushStyle =
  | "pen"
  | "calligraphy"
  | "neon"
  | "marker"
  | "rainbow"
  | "dotted"
  | "spray"
  | "laser"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "eraser";

/** Canvas-wide symmetry applied to strokes at creation time. */
export type SymmetryMode = "off" | "mirror" | "kaleido";

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
  /** symmetry captured when the stroke was drawn ("off" is stored as undefined) */
  sym?: Exclude<SymmetryMode, "off">;
}

export type AppStatus =
  | "loading-model"
  | "starting-camera"
  | "ready"
  | "camera-denied"
  | "error";

export interface FaceRelativePoint {
  fx: number;
  fy: number;
}

export interface MaskStroke {
  style: BrushStyle;
  color: string;
  size: number;
  points: FaceRelativePoint[];
}

export interface MaskLayer {
  id: string;
  name: string;
  strokes: MaskStroke[];
  scale: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
  visible: boolean;
  mirror?: boolean;
  colorOverride?: string;
}

