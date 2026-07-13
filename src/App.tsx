import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";
import { ActionsPanel } from "./components/ActionsPanel";
import { RadialDock } from "./components/RadialDock";
import { TopBar } from "./components/TopBar";
import { MaskWidget } from "./components/MaskWidget";
import { AlertIcon } from "./components/icons";
import { savePng } from "./lib/capture";
import {
  DEFAULT_PINCH_RATIO,
  GestureEngine,
  MAX_PINCH_RATIO,
  MIN_PINCH_RATIO,
  type PinchConfig,
} from "./lib/gestures";
import { HandUiController, isOverUi, type UiState } from "./lib/handUi";
import { drawHandSkeleton } from "./lib/skeleton";
import {
  createHandLandmarker,
  startCamera,
  videoPointToCanvas,
} from "./lib/tracking";
import {
  createFaceLandmarker,
  getFaceTransform,
  faceRelativeToCanvas,
  getMaskBounds,
  type FaceTransform,
} from "./lib/faceTracking";
import { drawStroke, eraseSegment } from "./lib/strokes";
import type { AppStatus, Stroke, Tool, MaskLayer, MaskStroke } from "./types";

const DEFAULT_TOOL: Tool = { style: "pen", color: "#22d3ee", size: 10 };
const PINCH_STORAGE_KEY = "draw-on-hand.pinchRatio";

/** Which handle of the mask-definition box an interaction targets. */
type DefEditMode =
  | "idle"
  | "move-box"
  | "move-anchor"
  | "resize-tl"
  | "resize-tr"
  | "resize-bl"
  | "resize-br";

/** Per-hand tracking state so both hands can draw independently. */
interface HandState {
  gesture: GestureEngine;
  stroke: Stroke | null;
  prevPinch: boolean;
  /** pinch began over the UI — never leave a stroke behind */
  pinchFromUi: boolean;
  /** pinch began on the canvas — never turn into a UI click */
  pinchFromCanvas: boolean;
  /** definition handle this fingertip was hovering last frame; captured so a
   * pinch grabs the intended target even though closing the pinch shifts the
   * fingertip position off it. */
  hoverHandle: DefEditMode;
}

function loadPinchRatio(): number {
  const stored = localStorage.getItem(PINCH_STORAGE_KEY);
  if (stored === null) return DEFAULT_PINCH_RATIO;
  const raw = Number(stored);
  if (!Number.isFinite(raw)) return DEFAULT_PINCH_RATIO;
  return Math.min(MAX_PINCH_RATIO, Math.max(MIN_PINCH_RATIO, raw));
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  const strokesRef = useRef<Stroke[]>([]);
  const pinchConfigRef = useRef<PinchConfig>({ ratioStart: loadPinchRatio() });
  const handsRef = useRef(new Map<string, HandState>());
  const uiRef = useRef(new HandUiController());
  /** which hand currently drives the UI controller */
  const uiHandRef = useRef<string | null>(null);
  const toolRef = useRef<Tool>(DEFAULT_TOOL);
  const handPresentRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const [tool, setTool] = useState<Tool>(DEFAULT_TOOL);
  const [status, setStatus] = useState<AppStatus>("loading-model");
  const [handPresent, setHandPresent] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(true);
  const [flashKey, setFlashKey] = useState(0);
  const [pinchRatio, setPinchRatio] = useState(
    pinchConfigRef.current.ratioStart,
  );
  const [drawingHand, setDrawingHand] = useState<"Left" | "Right">(() => {
    const stored = localStorage.getItem("draw-on-hand.drawingHand");
    return stored === "Left" || stored === "Right" ? stored : "Right";
  });


  // Floating panels: the radial dock (anchored by its center point) and the
  // actions panel (top-left point; null = its default CSS position).
  const [dockPos, setDockPos] = useState(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight - 200,
  }));
  const [dockExpanded, setDockExpanded] = useState(true);
  const [actionsPos, setActionsPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const actionsRef = useRef<HTMLDivElement>(null);

  const [masks, setMasks] = useState<MaskLayer[]>([]);
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const [maskWidgetOpen, setMaskWidgetOpen] = useState(false);
  const [maskWidgetPos, setMaskWidgetPos] = useState<{ x: number; y: number } | null>(null);

  const [maskDefinition, setMaskDefinition] = useState<{
    active: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
  }>({
    active: false,
    x: 0.5,
    y: 0.5,
    width: 0.3,
    height: 0.3,
    anchorX: 0.5,
    anchorY: 0.5,
  });

  const maskDefinitionRef = useRef(maskDefinition);
  useEffect(() => {
    maskDefinitionRef.current = maskDefinition;
  }, [maskDefinition]);

  const defEditStateRef = useRef<{
    mode: DefEditMode;
    activeHandKey: string | null;
    startX: number;
    startY: number;
    startBoxX: number;
    startBoxY: number;
    startBoxW: number;
    startBoxH: number;
    startAnchorX: number;
    startAnchorY: number;
  }>({
    mode: "idle",
    activeHandKey: null,
    startX: 0,
    startY: 0,
    startBoxX: 0.5,
    startBoxY: 0.5,
    startBoxW: 0.3,
    startBoxH: 0.3,
    startAnchorX: 0.5,
    startAnchorY: 0.5,
  });

  /** Which definition handle the fingertip is currently near (updated each
   * frame from hand positions, read one frame later by the overlay draw) so
   * the target lights up before the user pinches. */
  const defHoverRef = useRef<string | null>(null);

  const maskWidgetRef = useRef<HTMLDivElement>(null);
  const lastFaceTransformRef = useRef<FaceTransform | null>(null);

  const drawingHandRef = useRef(drawingHand);
  const masksRef = useRef<MaskLayer[]>([]);

  useEffect(() => {
    drawingHandRef.current = drawingHand;
  }, [drawingHand]);

  useEffect(() => {
    masksRef.current = masks;
  }, [masks]);

  const selectedMaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedMaskIdRef.current = selectedMaskId;
  }, [selectedMaskId]);

  const maskEditStateRef = useRef<{
    mode: "idle" | "drag" | "scale";
    activeHandKey: string | null;
    startHandX: number;
    startHandY: number;
    startOffsetX: number;
    startOffsetY: number;
    startScale: number;
    startDist: number;
  }>({
    mode: "idle",
    activeHandKey: null,
    startHandX: 0,
    startHandY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startScale: 1,
    startDist: 0,
  });

  const mouseEditStateRef = useRef<{
    mode: "idle" | "drag" | "scale";
    startHandX: number;
    startHandY: number;
    startOffsetX: number;
    startOffsetY: number;
    startScale: number;
    startDist: number;
  }>({
    mode: "idle",
    startHandX: 0,
    startHandY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startScale: 1,
    startDist: 0,
  });

  const handleSelectMask = useCallback((id: string | null) => {
    setSelectedMaskId(id);
  }, []);

  const handleToggleMaskVisible = useCallback((id: string) => {
    setMasks((prev) =>
      prev.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m))
    );
  }, []);

  const handleDeleteMask = useCallback((id: string) => {
    setMasks((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleUpdateMask = useCallback((id: string, updates: Partial<MaskLayer>) => {
    setMasks((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    if (maskDefinition.active) {
      // Click handles for Mask Definition Box
      const x1 = (maskDefinition.x - maskDefinition.width / 2) * w;
      const x2 = (maskDefinition.x + maskDefinition.width / 2) * w;
      const y1 = (maskDefinition.y - maskDefinition.height / 2) * h;
      const y2 = (maskDefinition.y + maskDefinition.height / 2) * h;

      const ax = maskDefinition.anchorX * w;
      const ay = maskDefinition.anchorY * h;

      const cx = maskDefinition.x * w;
      const cy = maskDefinition.y * h;

      const dist = (px: number, py: number) => Math.hypot(clickX - px, clickY - py);

      let mode: typeof defEditStateRef.current.mode = "idle";
      if (dist(ax, ay) < 25) {
        mode = "move-anchor";
      } else if (dist(cx, cy) < 25) {
        mode = "move-box";
      } else if (dist(x1, y1) < 25) {
        mode = "resize-tl";
      } else if (dist(x2, y1) < 25) {
        mode = "resize-tr";
      } else if (dist(x1, y2) < 25) {
        mode = "resize-bl";
      } else if (dist(x2, y2) < 25) {
        mode = "resize-br";
      }

      if (mode === "idle") return;

      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      defEditStateRef.current = {
        mode,
        activeHandKey: null,
        startX: clickX,
        startY: clickY,
        startBoxX: maskDefinition.x,
        startBoxY: maskDefinition.y,
        startBoxW: maskDefinition.width,
        startBoxH: maskDefinition.height,
        startAnchorX: maskDefinition.anchorX,
        startAnchorY: maskDefinition.anchorY,
      };

      const handlePointerMove = (moveEvt: PointerEvent) => {
        const curX = moveEvt.clientX - rect.left;
        const curY = moveEvt.clientY - rect.top;
        const dx = (curX - defEditStateRef.current.startX) / w;
        const dy = (curY - defEditStateRef.current.startY) / h;

        const edit = defEditStateRef.current;
        if (edit.mode === "move-anchor") {
          const newAx = Math.min(1, Math.max(0, edit.startAnchorX + dx));
          const newAy = Math.min(1, Math.max(0, edit.startAnchorY + dy));
          setMaskDefinition((d) => ({ ...d, anchorX: newAx, anchorY: newAy }));
        } else if (edit.mode === "move-box") {
          const newCx = Math.min(1, Math.max(0, edit.startBoxX + dx));
          const newCy = Math.min(1, Math.max(0, edit.startBoxY + dy));
          const deltaX = newCx - edit.startBoxX;
          const deltaY = newCy - edit.startBoxY;
          setMaskDefinition((d) => ({
            ...d,
            x: newCx,
            y: newCy,
            anchorX: Math.min(1, Math.max(0, edit.startAnchorX + deltaX)),
            anchorY: Math.min(1, Math.max(0, edit.startAnchorY + deltaY)),
          }));
        } else if (edit.mode === "resize-br") {
          const right = Math.min(1, Math.max(edit.startBoxX - edit.startBoxW / 2 + 0.05, edit.startBoxX + edit.startBoxW / 2 + dx));
          const bottom = Math.min(1, Math.max(edit.startBoxY - edit.startBoxH / 2 + 0.05, edit.startBoxY + edit.startBoxH / 2 + dy));
          const left = edit.startBoxX - edit.startBoxW / 2;
          const top = edit.startBoxY - edit.startBoxH / 2;
          setMaskDefinition((d) => ({
            ...d,
            x: (left + right) / 2,
            y: (top + bottom) / 2,
            width: right - left,
            height: bottom - top,
          }));
        } else if (edit.mode === "resize-tl") {
          const left = Math.min(edit.startBoxX + edit.startBoxW / 2 - 0.05, Math.max(0, edit.startBoxX - edit.startBoxW / 2 + dx));
          const top = Math.min(edit.startBoxY + edit.startBoxH / 2 - 0.05, Math.max(0, edit.startBoxY - edit.startBoxH / 2 + dy));
          const right = edit.startBoxX + edit.startBoxW / 2;
          const bottom = edit.startBoxY + edit.startBoxH / 2;
          setMaskDefinition((d) => ({
            ...d,
            x: (left + right) / 2,
            y: (top + bottom) / 2,
            width: right - left,
            height: bottom - top,
          }));
        } else if (edit.mode === "resize-tr") {
          const right = Math.min(1, Math.max(edit.startBoxX - edit.startBoxW / 2 + 0.05, edit.startBoxX + edit.startBoxW / 2 + dx));
          const top = Math.min(edit.startBoxY + edit.startBoxH / 2 - 0.05, Math.max(0, edit.startBoxY - edit.startBoxH / 2 + dy));
          const left = edit.startBoxX - edit.startBoxW / 2;
          const bottom = edit.startBoxY + edit.startBoxH / 2;
          setMaskDefinition((d) => ({
            ...d,
            x: (left + right) / 2,
            y: (top + bottom) / 2,
            width: right - left,
            height: bottom - top,
          }));
        } else if (edit.mode === "resize-bl") {
          const left = Math.min(edit.startBoxX + edit.startBoxW / 2 - 0.05, Math.max(0, edit.startBoxX - edit.startBoxW / 2 + dx));
          const bottom = Math.min(1, Math.max(edit.startBoxY - edit.startBoxH / 2 + 0.05, edit.startBoxY + edit.startBoxH / 2 + dy));
          const right = edit.startBoxX + edit.startBoxW / 2;
          const top = edit.startBoxY - edit.startBoxH / 2;
          setMaskDefinition((d) => ({
            ...d,
            x: (left + right) / 2,
            y: (top + bottom) / 2,
            width: right - left,
            height: bottom - top,
          }));
        }
      };

      const handlePointerUp = () => {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (err) {}
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        defEditStateRef.current.mode = "idle";
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return;
    }

    const face = lastFaceTransformRef.current;
    if (!selectedMaskId || !face) return;
    const selectedMask = masks.find((m) => m.id === selectedMaskId);
    if (!selectedMask || !selectedMask.visible) return;

    const bounds = getMaskBounds(selectedMask.strokes);
    if (!bounds) return;



    const centerPt = faceRelativeToCanvas(
      { fx: bounds.centerX, fy: bounds.centerY },
      face,
      selectedMask.scale,
      selectedMask.offsetX,
      selectedMask.offsetY,
      selectedMask.mirror,
    );
    const scalePt = faceRelativeToCanvas(
      { fx: bounds.maxFx, fy: bounds.maxFy },
      face,
      selectedMask.scale,
      selectedMask.offsetX,
      selectedMask.offsetY,
      selectedMask.mirror,
    );

    const cx = centerPt.x * w;
    const cy = centerPt.y * h;
    const sx = scalePt.x * w;
    const sy = scalePt.y * h;

    const distToCenter = Math.hypot(clickX - cx, clickY - cy);
    const distToScale = Math.hypot(clickX - sx, clickY - sy);

    let mode: "idle" | "drag" | "scale" = "idle";
    if (distToCenter < 35) {
      mode = "drag";
    } else if (distToScale < 35) {
      mode = "scale";
    }

    if (mode === "idle") return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    mouseEditStateRef.current = {
      mode,
      startHandX: clickX,
      startHandY: clickY,
      startOffsetX: selectedMask.offsetX,
      startOffsetY: selectedMask.offsetY,
      startScale: selectedMask.scale,
      startDist: Math.hypot(clickX - cx, clickY - cy),
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      const curX = moveEvt.clientX - rect.left;
      const curY = moveEvt.clientY - rect.top;
      const currentFace = lastFaceTransformRef.current;
      if (!currentFace) return;

      if (mouseEditStateRef.current.mode === "drag") {
        const dx = curX - mouseEditStateRef.current.startHandX;
        const dy = curY - mouseEditStateRef.current.startHandY;

        const dnx = dx / w;
        const dny = dy / h;
        const dfx = dnx / currentFace.scale;
        const dfy = dny / currentFace.scale;

        const cos = Math.cos(-currentFace.angle);
        const sin = Math.sin(-currentFace.angle);
        const rdfx = dfx * cos - dfy * sin;
        const rdfy = dfx * sin + dfy * cos;

        handleUpdateMask(selectedMask.id, {
          offsetX: mouseEditStateRef.current.startOffsetX + rdfx,
          offsetY: mouseEditStateRef.current.startOffsetY + rdfy,
        });
      } else if (mouseEditStateRef.current.mode === "scale") {
        const curDist = Math.hypot(curX - cx, curY - cy);
        const startDist = mouseEditStateRef.current.startDist;
        if (startDist > 5) {
          const ratio = curDist / startDist;
          const newScale = Math.min(2.5, Math.max(0.3, mouseEditStateRef.current.startScale * ratio));
          handleUpdateMask(selectedMask.id, { scale: newScale });
        }
      }
    };

    const handlePointerUp = () => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      mouseEditStateRef.current.mode = "idle";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [masks, selectedMaskId, handleUpdateMask]);

  const handleDrawingHandChange = useCallback((hand: "Left" | "Right") => {
    setDrawingHand(hand);
    localStorage.setItem("draw-on-hand.drawingHand", hand);
  }, []);

  const handlePinchRatio = useCallback((value: number) => {
    const v = Math.min(MAX_PINCH_RATIO, Math.max(MIN_PINCH_RATIO, value));
    pinchConfigRef.current.ratioStart = v;
    setPinchRatio(v);
    localStorage.setItem(PINCH_STORAGE_KEY, String(v));
  }, []);

  const movePanel = useCallback((id: string, dx: number, dy: number) => {
    if (id === "dock") {
      setDockPos((p) => ({
        x: Math.min(window.innerWidth - 48, Math.max(48, p.x + dx)),
        y: Math.min(window.innerHeight - 48, Math.max(48, p.y + dy)),
      }));
    } else if (id === "actions") {
      setActionsPos((p) => {
        const base = p ?? (() => {
          const r = actionsRef.current?.getBoundingClientRect();
          return r ? { x: r.left, y: r.top } : null;
        })();
        if (!base) return p;
        return {
          x: Math.min(window.innerWidth - 60, Math.max(8, base.x + dx)),
          y: Math.min(window.innerHeight - 60, Math.max(8, base.y + dy)),
        };
      });
    } else if (id === "mask") {
      setMaskWidgetPos((p) => {
        const base = p ?? (() => {
          const r = maskWidgetRef.current?.getBoundingClientRect();
          return r ? { x: r.left, y: r.top } : { x: window.innerWidth - 300, y: 150 };
        })();
        return {
          x: Math.min(window.innerWidth - 60, Math.max(8, base.x + dx)),
          y: Math.min(window.innerHeight - 60, Math.max(8, base.y + dy)),
        };
      });
    }
  }, []);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  /** Resize both canvases to the viewport (device-pixel exact) and set the
   * context transform so all drawing code works in CSS pixels. */
  const sizeCanvases = useCallback(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [baseRef.current, liveRef.current]) {
      if (!canvas) continue;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const replay = useCallback(() => {
    const base = baseRef.current;
    const ctx = base?.getContext("2d");
    if (!base || !ctx) return;
    const w = base.clientWidth;
    const h = base.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke, w, h);
    }
  }, []);

  useEffect(() => {
    sizeCanvases();
    const onResize = () => {
      sizeCanvases();
      replay();
      // Keep floating panels on screen after a resize.
      setDockPos((p) => ({
        x: Math.min(window.innerWidth - 48, Math.max(48, p.x)),
        y: Math.min(window.innerHeight - 48, Math.max(48, p.y)),
      }));
      setActionsPos((p) =>
        p
          ? {
              x: Math.min(window.innerWidth - 60, Math.max(8, p.x)),
              y: Math.min(window.innerHeight - 60, Math.max(8, p.y)),
            }
          : p,
      );
      setMaskWidgetPos((p) =>
        p
          ? {
              x: Math.min(window.innerWidth - 60, Math.max(8, p.x)),
              y: Math.min(window.innerHeight - 60, Math.max(8, p.y)),
            }
          : p,
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sizeCanvases, replay]);

  /** Move a finished stroke from a hand onto the committed layer. */
  const commitStroke = useCallback((state: HandState) => {
    const stroke = state.stroke;
    if (!stroke) return;
    state.stroke = null;

    const base = baseRef.current;
    const ctx = base?.getContext("2d");
    if (base && ctx && stroke.style !== "eraser") {
      // Eraser strokes were already applied to the base incrementally.
      drawStroke(ctx, stroke, base.clientWidth, base.clientHeight);
    }
    strokesRef.current.push(stroke);
    setStrokeCount(strokesRef.current.length);
  }, []);

  // ---------- Tracking pipeline ----------

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let landmarker: HandLandmarker | null = null;
    let faceLandmarker: FaceLandmarker | null = null;
    let stream: MediaStream | null = null;

    const drawCursor = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      ui: UiState,
      pinching: boolean,
      strength: number,
    ) => {
      const t = toolRef.current;
      const color = ui.overUi
        ? "rgba(255,255,255,0.95)"
        : t.style === "eraser"
          ? "rgba(255,255,255,0.95)"
          : t.color;
      const radius = ui.overUi
        ? 11
        : Math.max(t.size * 0.6, 7) + (1 - strength) * 8;

      // Every ring gets a dark under-stroke first so the cursor stays
      // visible on top of bright glass panels and light video backgrounds.
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
        ctx.arc(x, y, Math.max(t.size * 0.3, 3.5), 0, Math.PI * 2);
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
                ? t.style === "eraser"
                  ? "ERASING"
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
    };

    const handleFrame = () => {
      const video = videoRef.current;
      const live = liveRef.current;
      const base = baseRef.current;
      if (!video || !live || !base || !landmarker) return;

      const timestamp = performance.now();
      const result = landmarker.detectForVideo(video, timestamp);
      const faceResult = faceLandmarker?.detectForVideo(video, timestamp);

      const lctx = live.getContext("2d");
      const bctx = base.getContext("2d");
      if (!lctx || !bctx) return;

      const w = live.clientWidth;
      const h = live.clientHeight;
      lctx.clearRect(0, 0, w, h);

      // 1. Process Face Tracking & Render AR Masks
      let faceTransform: FaceTransform | null = null;
      if (faceResult && faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
        const landmarks = faceResult.faceLandmarks[0];
        faceTransform = getFaceTransform(
          landmarks,
          video.videoWidth,
          video.videoHeight,
          w,
          h,
        );
        lastFaceTransformRef.current = faceTransform;
      } else {
        lastFaceTransformRef.current = null;
      }

      if (faceTransform) {
        // Draw Face nose tip indicator dot (glowing cyan)
        lctx.save();
        lctx.beginPath();
        lctx.arc(faceTransform.x * w, faceTransform.y * h, 5, 0, Math.PI * 2);
        lctx.fillStyle = "rgba(34, 211, 238, 0.9)";
        lctx.shadowColor = "rgba(34, 211, 238, 0.8)";
        lctx.shadowBlur = 10;
        lctx.fill();
        lctx.restore();

        // Render AR Masks
        // Render AR Masks
        for (const mask of masksRef.current) {
          if (!mask.visible) continue;
          lctx.save();
          lctx.globalAlpha = mask.opacity;
          for (const stroke of mask.strokes) {
            const normalizedPoints = stroke.points.map((pt) =>
              faceRelativeToCanvas(
                pt,
                faceTransform!,
                mask.scale,
                mask.offsetX,
                mask.offsetY,
                mask.mirror,
              )
            );
            const strokeColor = mask.colorOverride || stroke.color;
            drawStroke(lctx, { ...stroke, color: strokeColor, points: normalizedPoints }, w, h);
          }
          lctx.restore();
        }

        // Render Bounding Box and Handles for SELECTED mask
        if (selectedMaskIdRef.current) {
          const selectedMask = masksRef.current.find((m) => m.id === selectedMaskIdRef.current);
          if (selectedMask && selectedMask.visible) {
            const bounds = getMaskBounds(selectedMask.strokes);
            if (bounds) {
              const tl = faceRelativeToCanvas({ fx: bounds.minFx, fy: bounds.minFy }, faceTransform, selectedMask.scale, selectedMask.offsetX, selectedMask.offsetY, selectedMask.mirror);
              const tr = faceRelativeToCanvas({ fx: bounds.maxFx, fy: bounds.minFy }, faceTransform, selectedMask.scale, selectedMask.offsetX, selectedMask.offsetY, selectedMask.mirror);
              const br = faceRelativeToCanvas({ fx: bounds.maxFx, fy: bounds.maxFy }, faceTransform, selectedMask.scale, selectedMask.offsetX, selectedMask.offsetY, selectedMask.mirror);
              const bl = faceRelativeToCanvas({ fx: bounds.minFx, fy: bounds.maxFy }, faceTransform, selectedMask.scale, selectedMask.offsetX, selectedMask.offsetY, selectedMask.mirror);

              const tlx = tl.x * w, tly = tl.y * h;
              const trx = tr.x * w, tr_y = tr.y * h;
              const brx = br.x * w, bry = br.y * h;
              const blx = bl.x * w, bly = bl.y * h;

              lctx.save();
              lctx.strokeStyle = "rgba(34, 211, 238, 0.65)";
              lctx.lineWidth = 1.8;
              lctx.setLineDash([6, 4]);
              lctx.beginPath();
              lctx.moveTo(tlx, tly);
              lctx.lineTo(trx, tr_y);
              lctx.lineTo(brx, bry);
              lctx.lineTo(blx, bly);
              lctx.closePath();
              lctx.stroke();

              // Draw Center Handle (Move)
              const centerPt = faceRelativeToCanvas({ fx: bounds.centerX, fy: bounds.centerY }, faceTransform, selectedMask.scale, selectedMask.offsetX, selectedMask.offsetY, selectedMask.mirror);
              const cx = centerPt.x * w, cy = centerPt.y * h;
              lctx.beginPath();
              lctx.arc(cx, cy, 14, 0, Math.PI * 2);
              lctx.fillStyle = "rgba(34, 211, 238, 0.25)";
              lctx.strokeStyle = "rgba(34, 211, 238, 0.95)";
              lctx.lineWidth = 2.2;
              lctx.setLineDash([]);
              lctx.fill();
              lctx.stroke();

              // Center target dot
              lctx.beginPath();
              lctx.arc(cx, cy, 4, 0, Math.PI * 2);
              lctx.fillStyle = "#ffffff";
              lctx.fill();

              // Draw Scale Handle (Bottom-Right)
              lctx.beginPath();
              lctx.arc(brx, bry, 12, 0, Math.PI * 2);
              lctx.fillStyle = "rgba(236, 72, 153, 0.25)";
              lctx.strokeStyle = "rgba(236, 72, 153, 0.95)";
              lctx.lineWidth = 2.2;
              lctx.fill();
              lctx.stroke();

              lctx.restore();
            }
          }
        }
      }

      // 1.5 Render Mask Definition overlay if active
      if (maskDefinitionRef.current.active) {
        const md = maskDefinitionRef.current;
        const x1 = (md.x - md.width / 2) * w;
        const x2 = (md.x + md.width / 2) * w;
        const y1 = (md.y - md.height / 2) * h;
        const y2 = (md.y + md.height / 2) * h;
        const ax = md.anchorX * w;
        const ay = md.anchorY * h;
        const cx = md.x * w;
        const cy = md.y * h;

        lctx.save();
        
        // Draw selection boundary box (glowing orange)
        lctx.strokeStyle = "rgba(251, 146, 60, 0.75)";
        lctx.lineWidth = 2.2;
        lctx.setLineDash([5, 5]);
        lctx.beginPath();
        lctx.rect(x1, y1, x2 - x1, y2 - y1);
        lctx.stroke();

        const hoveredHandle = defHoverRef.current;

        // Draw corner handles (orange circles); the one the fingertip is
        // aiming at grows and brightens so the user knows it's grabbable.
        lctx.strokeStyle = "#ffffff";
        lctx.lineWidth = 1.5;
        lctx.setLineDash([]);
        const drawHandle = (hx: number, hy: number, id: string) => {
          const on = hoveredHandle === id;
          lctx.beginPath();
          lctx.arc(hx, hy, on ? 13 : 8, 0, Math.PI * 2);
          lctx.fillStyle = on ? "#fdba74" : "#fb923c";
          if (on) {
            lctx.shadowColor = "#fb923c";
            lctx.shadowBlur = 16;
          }
          lctx.fill();
          lctx.stroke();
          lctx.shadowBlur = 0;
        };
        drawHandle(x1, y1, "resize-tl");
        drawHandle(x2, y1, "resize-tr");
        drawHandle(x1, y2, "resize-bl");
        drawHandle(x2, y2, "resize-br");

        // Draw center move handle
        const boxOn = hoveredHandle === "move-box";
        lctx.beginPath();
        lctx.arc(cx, cy, boxOn ? 16 : 12, 0, Math.PI * 2);
        lctx.fillStyle = boxOn ? "rgba(251, 146, 60, 0.5)" : "rgba(251, 146, 60, 0.25)";
        lctx.strokeStyle = "#fb923c";
        lctx.lineWidth = 2;
        if (boxOn) {
          lctx.shadowColor = "#fb923c";
          lctx.shadowBlur = 16;
        }
        lctx.fill();
        lctx.stroke();
        lctx.shadowBlur = 0;

        // Target dot inside center handle
        lctx.beginPath();
        lctx.arc(cx, cy, 3, 0, Math.PI * 2);
        lctx.fillStyle = "#ffffff";
        lctx.fill();

        // Draw custom anchor point handle (glowing yellow crosshair target)
        const anchorOn = hoveredHandle === "move-anchor";
        lctx.beginPath();
        lctx.arc(ax, ay, anchorOn ? 16 : 12, 0, Math.PI * 2);
        lctx.fillStyle = anchorOn ? "rgba(250, 204, 21, 0.65)" : "rgba(250, 204, 21, 0.4)";
        lctx.strokeStyle = "#facc15";
        lctx.lineWidth = 2.2;
        if (anchorOn) {
          lctx.shadowColor = "#facc15";
          lctx.shadowBlur = 18;
        }
        lctx.fill();
        lctx.stroke();
        lctx.shadowBlur = 0;

        // Anchor center target dot
        lctx.beginPath();
        lctx.arc(ax, ay, 4, 0, Math.PI * 2);
        lctx.fillStyle = "#ffffff";
        lctx.fill();

        // Draw text label above box
        lctx.font = '600 11px "Outfit", sans-serif';
        lctx.fillStyle = "#fb923c";
        lctx.textAlign = "center";
        lctx.fillText("ขอบเขตหน้ากาก (DRAG CORNERS)", cx, y1 - 12);

        // Draw text label next to Nose Anchor
        lctx.fillStyle = "#facc15";
        lctx.textAlign = "left";
        lctx.fillText("จุดยึดจมูก (NOSE ANCHOR)", ax + 18, ay + 4);

        lctx.restore();
      }

      // 2. Process Hand Tracking
      const seen = new Set<string>();
      const detected = result.landmarks.map((lm, i) => {
        let key = result.handedness?.[i]?.[0]?.categoryName ?? `hand-${i}`;
        if (seen.has(key)) key = `${key}-2`;
        seen.add(key);
        return { key, lm, world: result.worldLandmarks?.[i] };
      });

      // Hands that disappeared: commit their strokes, free their state.
      for (const [key, state] of handsRef.current) {
        if (!seen.has(key)) {
          state.prevPinch = false;
          commitStroke(state);
          handsRef.current.delete(key);
          if (uiHandRef.current === key) {
            uiRef.current.reset();
            uiHandRef.current = null;
          }
        }
      }

      if (detected.length === 0) {
        if (handPresentRef.current) {
          handPresentRef.current = false;
          setHandPresent(false);
        }
        uiHandRef.current = null;
        uiRef.current.clearHover();
        return;
      }

      if (!handPresentRef.current) {
        handPresentRef.current = true;
        setHandPresent(true);
      }

      const frames = detected.map(({ key, lm, world }) => {
        let state = handsRef.current.get(key);
        if (!state) {
          state = {
            gesture: new GestureEngine(pinchConfigRef.current),
            stroke: null,
            prevPinch: false,
            pinchFromUi: false,
            pinchFromCanvas: false,
            hoverHandle: "idle",
          };
          handsRef.current.set(key, state);
        }
        const hand = state.gesture.update(lm, world);
        const pt = videoPointToCanvas(
          hand.x,
          hand.y,
          video.videoWidth,
          video.videoHeight,
          w,
          h,
        );
        const overUi = isOverUi(pt.x, pt.y);

        // Rising edge of the pinch. Captured here BEFORE prevPinch is
        // overwritten below, so the mask-box / mask-manipulation
        // interceptors further down can still detect "just pinched" — they
        // run after this map, where f.state.prevPinch already equals the
        // current frame's value and can no longer reveal the transition.
        const justPinched = hand.pinching && !state.prevPinch;

        if (justPinched) {
          state.pinchFromUi = overUi;
          state.pinchFromCanvas = !overUi;
        } else if (!hand.pinching) {
          state.pinchFromUi = false;
          state.pinchFromCanvas = false;
        }
        state.prevPinch = hand.pinching;

        return { key, lm, state, hand, pt, overUi, justPinched };
      });

      let uiFrame =
        uiRef.current.isEngaged() && uiHandRef.current
          ? frames.find((f) => f.key === uiHandRef.current)
          : undefined;
      if (!uiFrame) {
        uiFrame = frames.find((f) => f.overUi || f.key === uiHandRef.current);
      }

      let uiState: UiState = { overUi: false, mode: "idle" };
      if (uiFrame) {
        uiHandRef.current = uiFrame.key;
        uiState = uiRef.current.update(
          uiFrame.pt.x,
          uiFrame.pt.y,
          uiFrame.hand.pinching && !uiFrame.state.pinchFromCanvas,
        );
        if (uiState.mode === "drag" && uiState.dragId) {
          movePanel(uiState.dragId, uiState.dragDx ?? 0, uiState.dragDy ?? 0);
        }
      } else {
        uiHandRef.current = null;
        uiRef.current.clearHover();
      }

      const t = toolRef.current;

      // Guard against a stuck edit session: if a finger grabbed a handle and
      // then the owning hand left the frame (or MediaPipe relabelled it), its
      // key vanishes from `frames`. Reset so the next pinch can grab again.
      // Mouse-driven edits use activeHandKey === null and are left untouched.
      const detectedKeys = new Set(frames.map((fr) => fr.key));
      const defOwner = defEditStateRef.current.activeHandKey;
      if (defOwner !== null && !detectedKeys.has(defOwner)) {
        defEditStateRef.current.mode = "idle";
        defEditStateRef.current.activeHandKey = null;
      }
      const maskOwner = maskEditStateRef.current.activeHandKey;
      if (maskOwner !== null && !detectedKeys.has(maskOwner)) {
        maskEditStateRef.current.mode = "idle";
        maskEditStateRef.current.activeHandKey = null;
      }

      // Which definition handle a fingertip is aiming at this frame (drives
      // the hover highlight next frame). Reset each frame; set during the loop.
      let nextDefHover: string | null = null;

      for (const f of frames) {
        const isEraserHand = f.key === (drawingHandRef.current === "Right" ? "Left" : "Right");
        const handStyle = isEraserHand ? "eraser" : t.style;
        const handColor = isEraserHand ? "#e2e8f0" : t.color;

        const isUiHand = f === uiFrame;
        const handUiState: UiState = isUiHand
          ? uiState
          : { overUi: f.overUi, mode: f.overUi ? "hover" : "idle" };

        // Intercept pinch for mask definition box (dragging/resizing/anchor setting)
        let defIntercept = false;
        if (maskDefinitionRef.current.active) {
          const md = maskDefinitionRef.current;
          const x1 = (md.x - md.width / 2) * w;
          const x2 = (md.x + md.width / 2) * w;
          const y1 = (md.y - md.height / 2) * h;
          const y2 = (md.y + md.height / 2) * h;
          const ax = md.anchorX * w;
          const ay = md.anchorY * h;
          const cx = md.x * w;
          const cy = md.y * h;

          const dist = (px: number, py: number) => Math.hypot(f.pt.x - px, f.pt.y - py);
          // Nearest handle within `r` px, or "idle". Anchor first (it sits on
          // top of the box centre) so it wins ties.
          const pickHandle = (r: number): DefEditMode => {
            if (dist(ax, ay) < r) return "move-anchor";
            if (dist(cx, cy) < r) return "move-box";
            if (dist(x1, y1) < r) return "resize-tl";
            if (dist(x2, y1) < r) return "resize-tr";
            if (dist(x1, y2) < r) return "resize-bl";
            if (dist(x2, y2) < r) return "resize-br";
            return "idle";
          };

          if (defEditStateRef.current.mode === "idle") {
            // What the fingertip is aiming at right now (generous radius).
            const near = f.overUi ? "idle" : pickHandle(70);
            if (near !== "idle") nextDefHover = near;

            // Grab the handle the finger was aiming at just BEFORE the pinch.
            // Closing thumb-to-index shifts the tracked midpoint, so the live
            // position usually drifts off the target on the pinch frame — the
            // remembered hover is what the user intended. `!stroke` stops a
            // pinch that is already drawing on the canvas from hijacking a
            // handle it happens to pass over. Not tied to the single
            // rising-edge frame, so a late-detected pinch still grabs.
            const aim = f.state.hoverHandle;
            if (f.hand.pinching && !f.state.stroke && aim !== "idle") {
              defEditStateRef.current = {
                mode: aim,
                activeHandKey: f.key,
                startX: f.pt.x,
                startY: f.pt.y,
                startBoxX: md.x,
                startBoxY: md.y,
                startBoxW: md.width,
                startBoxH: md.height,
                startAnchorX: md.anchorX,
                startAnchorY: md.anchorY,
              };
              f.state.pinchFromUi = true;
              defIntercept = true;
              nextDefHover = aim;
            }

            // Remember this frame's aim for the next one (only while open —
            // once pinching we must keep the pre-pinch target).
            if (!f.hand.pinching) f.state.hoverHandle = near;
          } else if (defEditStateRef.current.activeHandKey === f.key) {
            if (f.hand.pinching) {
              f.state.pinchFromUi = true;
              defIntercept = true;
              nextDefHover = defEditStateRef.current.mode;

              const dx = (f.pt.x - defEditStateRef.current.startX) / w;
              const dy = (f.pt.y - defEditStateRef.current.startY) / h;
              const edit = defEditStateRef.current;

              if (edit.mode === "move-anchor") {
                const newAx = Math.min(1, Math.max(0, edit.startAnchorX + dx));
                const newAy = Math.min(1, Math.max(0, edit.startAnchorY + dy));
                setMaskDefinition((d) => ({ ...d, anchorX: newAx, anchorY: newAy }));
              } else if (edit.mode === "move-box") {
                const newCx = Math.min(1, Math.max(0, edit.startBoxX + dx));
                const newCy = Math.min(1, Math.max(0, edit.startBoxY + dy));
                const deltaX = newCx - edit.startBoxX;
                const deltaY = newCy - edit.startBoxY;
                setMaskDefinition((d) => ({
                  ...d,
                  x: newCx,
                  y: newCy,
                  anchorX: Math.min(1, Math.max(0, edit.startAnchorX + deltaX)),
                  anchorY: Math.min(1, Math.max(0, edit.startAnchorY + deltaY)),
                }));
              } else if (edit.mode === "resize-br") {
                const right = Math.min(1, Math.max(edit.startBoxX - edit.startBoxW / 2 + 0.05, edit.startBoxX + edit.startBoxW / 2 + dx));
                const bottom = Math.min(1, Math.max(edit.startBoxY - edit.startBoxH / 2 + 0.05, edit.startBoxY + edit.startBoxH / 2 + dy));
                const left = edit.startBoxX - edit.startBoxW / 2;
                const top = edit.startBoxY - edit.startBoxH / 2;
                setMaskDefinition((d) => ({
                  ...d,
                  x: (left + right) / 2,
                  y: (top + bottom) / 2,
                  width: right - left,
                  height: bottom - top,
                }));
              } else if (edit.mode === "resize-tl") {
                const left = Math.min(edit.startBoxX + edit.startBoxW / 2 - 0.05, Math.max(0, edit.startBoxX - edit.startBoxW / 2 + dx));
                const top = Math.min(edit.startBoxY + edit.startBoxH / 2 - 0.05, Math.max(0, edit.startBoxY - edit.startBoxH / 2 + dy));
                const right = edit.startBoxX + edit.startBoxW / 2;
                const bottom = edit.startBoxY + edit.startBoxH / 2;
                setMaskDefinition((d) => ({
                  ...d,
                  x: (left + right) / 2,
                  y: (top + bottom) / 2,
                  width: right - left,
                  height: bottom - top,
                }));
              } else if (edit.mode === "resize-tr") {
                const right = Math.min(1, Math.max(edit.startBoxX - edit.startBoxW / 2 + 0.05, edit.startBoxX + edit.startBoxW / 2 + dx));
                const top = Math.min(edit.startBoxY + edit.startBoxH / 2 - 0.05, Math.max(0, edit.startBoxY - edit.startBoxH / 2 + dy));
                const left = edit.startBoxX - edit.startBoxW / 2;
                const bottom = edit.startBoxY + edit.startBoxH / 2;
                setMaskDefinition((d) => ({
                  ...d,
                  x: (left + right) / 2,
                  y: (top + bottom) / 2,
                  width: right - left,
                  height: bottom - top,
                }));
              } else if (edit.mode === "resize-bl") {
                const left = Math.min(edit.startBoxX + edit.startBoxW / 2 - 0.05, Math.max(0, edit.startBoxX - edit.startBoxW / 2 + dx));
                const bottom = Math.min(1, Math.max(edit.startBoxY - edit.startBoxH / 2 + 0.05, edit.startBoxY + edit.startBoxH / 2 + dy));
                const right = edit.startBoxX + edit.startBoxW / 2;
                const top = edit.startBoxY - edit.startBoxH / 2;
                setMaskDefinition((d) => ({
                  ...d,
                  x: (left + right) / 2,
                  y: (top + bottom) / 2,
                  width: right - left,
                  height: bottom - top,
                }));
              }
            } else {
              defEditStateRef.current.mode = "idle";
              defEditStateRef.current.activeHandKey = null;
            }
          }
        }

        // Intercept pinch for direct AR Mask manipulation (dragging/scaling)
        let maskIntercept = false;
        if (selectedMaskIdRef.current && faceTransform) {
          const selectedMask = masksRef.current.find((m) => m.id === selectedMaskIdRef.current);
          if (selectedMask && selectedMask.visible) {
            const bounds = getMaskBounds(selectedMask.strokes);
            if (bounds) {
              const centerPt = faceRelativeToCanvas(
                { fx: bounds.centerX, fy: bounds.centerY },
                faceTransform,
                selectedMask.scale,
                selectedMask.offsetX,
                selectedMask.offsetY,
                selectedMask.mirror,
              );
              const scalePt = faceRelativeToCanvas(
                { fx: bounds.maxFx, fy: bounds.maxFy },
                faceTransform,
                selectedMask.scale,
                selectedMask.offsetX,
                selectedMask.offsetY,
                selectedMask.mirror,
              );
              const cx = centerPt.x * w;
              const cy = centerPt.y * h;
              const sx = scalePt.x * w;
              const sy = scalePt.y * h;

              const distToCenter = Math.hypot(f.pt.x - cx, f.pt.y - cy);
              const distToScale = Math.hypot(f.pt.x - sx, f.pt.y - sy);

              if (maskEditStateRef.current.mode === "idle") {
                if (f.justPinched) {
                  if (distToCenter < 52) {
                    maskEditStateRef.current = {
                      mode: "drag",
                      activeHandKey: f.key,
                      startHandX: f.pt.x,
                      startHandY: f.pt.y,
                      startOffsetX: selectedMask.offsetX,
                      startOffsetY: selectedMask.offsetY,
                      startScale: selectedMask.scale,
                      startDist: 0,
                    };
                    f.state.pinchFromUi = true;
                    maskIntercept = true;
                  } else if (distToScale < 52) {
                    maskEditStateRef.current = {
                      mode: "scale",
                      activeHandKey: f.key,
                      startHandX: f.pt.x,
                      startHandY: f.pt.y,
                      startOffsetX: selectedMask.offsetX,
                      startOffsetY: selectedMask.offsetY,
                      startScale: selectedMask.scale,
                      startDist: Math.hypot(f.pt.x - cx, f.pt.y - cy),
                    };
                    f.state.pinchFromUi = true;
                    maskIntercept = true;
                  }
                }
              } else if (maskEditStateRef.current.activeHandKey === f.key) {
                if (f.hand.pinching) {
                  f.state.pinchFromUi = true;
                  maskIntercept = true;

                  if (maskEditStateRef.current.mode === "drag") {
                    const dx = f.pt.x - maskEditStateRef.current.startHandX;
                    const dy = f.pt.y - maskEditStateRef.current.startHandY;

                    const dnx = dx / w;
                    const dny = dy / h;
                    const dfx = dnx / faceTransform.scale;
                    const dfy = dny / faceTransform.scale;

                    const cos = Math.cos(-faceTransform.angle);
                    const sin = Math.sin(-faceTransform.angle);
                    const rdfx = dfx * cos - dfy * sin;
                    const rdfy = dfx * sin + dfy * cos;

                    handleUpdateMask(selectedMask.id, {
                      offsetX: maskEditStateRef.current.startOffsetX + rdfx,
                      offsetY: maskEditStateRef.current.startOffsetY + rdfy,
                    });
                  } else if (maskEditStateRef.current.mode === "scale") {
                    const curDist = Math.hypot(f.pt.x - cx, f.pt.y - cy);
                    const startDist = maskEditStateRef.current.startDist;
                    if (startDist > 10) {
                      const ratio = curDist / startDist;
                      const newScale = Math.min(2.5, Math.max(0.3, maskEditStateRef.current.startScale * ratio));
                      handleUpdateMask(selectedMask.id, { scale: newScale });
                    }
                  }
                } else {
                  maskEditStateRef.current.mode = "idle";
                  maskEditStateRef.current.activeHandKey = null;
                }
              }
            }
          }
        }

        const blocked = handUiState.overUi || f.state.pinchFromUi || maskIntercept || defIntercept;

        if (f.hand.pinching && !blocked) {
          let stroke = f.state.stroke;
          if (!stroke) {
            stroke = {
              style: handStyle,
              color: handColor,
              size: t.size,
              points: [],
            };
            f.state.stroke = stroke;
          }

          const nx = f.pt.x / w;
          const ny = f.pt.y / h;
          const last = stroke.points[stroke.points.length - 1];
          const farEnough =
            !last || Math.hypot((nx - last.x) * w, (ny - last.y) * h) > 1.2;
          if (farEnough) {
            stroke.points.push({ x: nx, y: ny });
            if (stroke.style === "eraser") {
              eraseSegment(bctx, stroke, w, h);
            }
          }

          if (stroke.style !== "eraser") {
            drawStroke(lctx, stroke, w, h);
          }

          if (!hasDrawnRef.current) {
            hasDrawnRef.current = true;
            setHasDrawn(true);
          }
        } else {
          commitStroke(f.state);
        }

        drawHandSkeleton(
          lctx,
          f.lm,
          video.videoWidth,
          video.videoHeight,
          w,
          h,
          handStyle === "eraser" ? "#e2e8f0" : handColor,
          f.hand.pinching,
        );
        drawCursor(
          lctx,
          f.pt.x,
          f.pt.y,
          handUiState,
          f.hand.pinching,
          f.hand.pinchStrength,
        );
      }

      // Publish this frame's handle hover for the next overlay draw.
      defHoverRef.current = maskDefinitionRef.current.active ? nextDefHover : null;
    };

    const init = async () => {
      try {
        setStatus("loading-model");
        landmarker = await createHandLandmarker();
        faceLandmarker = await createFaceLandmarker();
        if (cancelled) return;

        setStatus("starting-camera");
        const video = videoRef.current;
        if (!video) return;
        stream = await startCamera(video);
        if (cancelled) return;

        setStatus("ready");
        let lastVideoTime = -1;
        const loop = () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
            lastVideoTime = v.currentTime;
            handleFrame();
          }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setStatus(
          name === "NotAllowedError" || name === "NotFoundError"
            ? "camera-denied"
            : "error",
        );
        console.error("Draw on Hand init failed:", err);
      }
    };

    void init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close();
      faceLandmarker?.close();
    };
  }, [commitStroke, movePanel]);

  // ---------- Actions ----------

  const undo = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    replay();
  }, [replay]);

  const clearAll = useCallback(() => {
    strokesRef.current = [];
    for (const state of handsRef.current.values()) {
      state.stroke = null;
    }
    setStrokeCount(0);
    replay();
  }, [replay]);

  const handleSave = useCallback((includeCamera: boolean) => {
    const base = baseRef.current;
    if (!base) return;
    const ctx = base.getContext("2d");
    const face = lastFaceTransformRef.current;
    const w = base.clientWidth;
    const h = base.clientHeight;

    // Draw active masks onto the base canvas before saving
    if (ctx && face) {
      for (const mask of masks) {
        if (!mask.visible) continue;
        ctx.save();
        ctx.globalAlpha = mask.opacity;
        for (const stroke of mask.strokes) {
          const normalizedPoints = stroke.points.map((pt) =>
            faceRelativeToCanvas(
              pt,
              face,
              mask.scale,
              mask.offsetX,
              mask.offsetY,
              mask.mirror,
            )
          );
          const strokeColor = mask.colorOverride || stroke.color;
          drawStroke(ctx, { ...stroke, color: strokeColor, points: normalizedPoints }, w, h);
        }
        ctx.restore();
      }
    }

    savePng(base, videoRef.current, includeCamera);
    setFlashKey((k) => k + 1);

    // Replay to clear the temporary masks off the base canvas
    replay();
  }, [masks, replay]);

  const startMaskDefinition = useCallback(() => {
    if (strokesRef.current.length === 0) {
      alert("กรุณาวาดลายเส้นบนหน้าจอก่อนกดสร้างหน้ากาก");
      return;
    }

    // Find tight bounds of all current strokes on the canvas
    let minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0;
    for (const s of strokesRef.current) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }

    const padding = 0.05;
    const x1 = Math.max(0, minX - padding);
    const x2 = Math.min(1, maxX + padding);
    const y1 = Math.max(0, minY - padding);
    const y2 = Math.min(1, maxY + padding);

    const boxW = x2 - x1;
    const boxH = y2 - y1;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    setMaskDefinition({
      active: true,
      x: cx,
      y: cy,
      width: Math.max(0.1, boxW),
      height: Math.max(0.1, boxH),
      anchorX: cx,
      anchorY: cy,
    });
  }, []);

  const confirmBakeMask = useCallback(() => {
    const face = lastFaceTransformRef.current;
    if (!face) {
      alert("ไม่พบใบหน้าในกล้องเพื่อยึดตำแหน่งหน้ากาก กรุณาขยับหน้าให้อยู่ในหน้าจอ");
      return;
    }

    const { x, y, width, height, anchorX, anchorY } = maskDefinition;
    const x1 = x - width / 2;
    const x2 = x + width / 2;
    const y1 = y - height / 2;
    const y2 = y + height / 2;

    const selectedStrokes: Stroke[] = [];
    const remainingStrokes: Stroke[] = [];

    for (const stroke of strokesRef.current) {
      let isInside = false;
      for (const pt of stroke.points) {
        if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) {
          isInside = true;
          break;
        }
      }
      if (isInside) {
        selectedStrokes.push(stroke);
      } else {
        remainingStrokes.push(stroke);
      }
    }

    if (selectedStrokes.length === 0) {
      alert("ไม่พบเส้นวาดใดๆ ในขอบเขตที่เลือก กรุณาขยายขอบเขตให้ครอบคลุมรูปวาด");
      return;
    }

    // Bake relative to the custom nose anchor point
    const maskStrokes: MaskStroke[] = selectedStrokes.map((stroke) => {
      const relativePoints = stroke.points.map((pt) => {
        const dx = pt.x - anchorX;
        const dy = pt.y - anchorY;

        const cos = Math.cos(-face.angle);
        const sin = Math.sin(-face.angle);
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;

        return {
          fx: rx / face.scale,
          fy: ry / face.scale,
        };
      });

      return {
        style: stroke.style,
        color: stroke.color,
        size: stroke.size,
        points: relativePoints,
      };
    });

    const newMask: MaskLayer = {
      id: `mask-${Date.now()}`,
      name: `Mask ${masks.length + 1}`,
      strokes: maskStrokes,
      scale: 1.0,
      offsetX: 0.0,
      offsetY: 0.0,
      opacity: 1.0,
      visible: true,
      mirror: false,
    };

    setMasks((m) => [...m, newMask]);
    setSelectedMaskId(newMask.id);
    setMaskWidgetOpen(true);

    strokesRef.current = remainingStrokes;
    setStrokeCount(remainingStrokes.length);
    replay();

    setMaskDefinition((d) => ({ ...d, active: false }));
  }, [maskDefinition, masks.length, replay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  // ---------- Render ----------

  const loading = status === "loading-model" || status === "starting-camera";

  return (
    <div className="stage">
      <div className="backdrop" />
      <video
        ref={videoRef}
        className={`cam${cameraVisible ? "" : " hidden"}`}
        playsInline
        muted
      />
      <div className="dim" />
      <canvas ref={baseRef} className="layer" />
      <canvas ref={liveRef} className="layer live" onPointerDown={handlePointerDown} />

      <TopBar status={status} handPresent={handPresent} />

      <ActionsPanel
        innerRef={actionsRef}
        pos={actionsPos}
        onMove={(dx, dy) => movePanel("actions", dx, dy)}
        canUndo={strokeCount > 0}
        cameraVisible={cameraVisible}
        pinchRatio={pinchRatio}
        onPinchRatio={handlePinchRatio}
        onUndo={undo}
        onClear={clearAll}
        onToggleCamera={() => setCameraVisible((v) => !v)}
        onSave={handleSave}
        drawingHand={drawingHand}
        onDrawingHandChange={handleDrawingHandChange}
        onCreateMask={startMaskDefinition}
        maskWidgetOpen={maskWidgetOpen}
        onToggleMaskWidget={() => setMaskWidgetOpen((v) => !v)}
      />

      {maskDefinition.active && (
        <div className="mask-def-hud glass">
          <span className="hud-title">Mask Studio - กำหนดขอบเขตและจุดหมุน</span>
          <div className="hud-actions">
            <button className="hud-btn cancel" onClick={() => setMaskDefinition((d) => ({ ...d, active: false }))}>
              ยกเลิก
            </button>
            <button className="hud-btn confirm" onClick={confirmBakeMask}>
              ตกลงสร้างหน้ากาก
            </button>
          </div>
        </div>
      )}

      {maskWidgetOpen && (
        <MaskWidget
          innerRef={maskWidgetRef}
          pos={maskWidgetPos}
          onMove={(dx, dy) => movePanel("mask", dx, dy)}
          masks={masks}
          selectedMaskId={selectedMaskId}
          onSelectMask={handleSelectMask}
          onToggleVisible={handleToggleMaskVisible}
          onDeleteMask={handleDeleteMask}
          onUpdateMask={handleUpdateMask}
          onClose={() => setMaskWidgetOpen(false)}
        />
      )}

      {status === "ready" && !hasDrawn && (
        <div className="hint glass">
          <span className="emoji">🤏</span>
          Touch your thumb &amp; index tips to draw — pinch buttons to click,
          pinch-hold the hub to move it
        </div>
      )}

      <RadialDock
        tool={tool}
        onChange={setTool}
        expanded={dockExpanded}
        onToggle={() => setDockExpanded((v) => !v)}
        pos={dockPos}
        onMove={(dx, dy) => movePanel("dock", dx, dy)}
      />

      {loading && (
        <div className="overlay-center">
          <div className="overlay-card glass">
            <div className="spinner" />
            <h2>
              {status === "loading-model"
                ? "Loading hand tracking…"
                : "Starting camera…"}
            </h2>
            <p>
              Everything runs locally in your browser — no video ever leaves
              your device.
            </p>
          </div>
        </div>
      )}

      {(status === "camera-denied" || status === "error") && (
        <div className="overlay-center">
          <div className="overlay-card glass">
            <div className="overlay-icon">
              <AlertIcon />
            </div>
            <h2>
              {status === "camera-denied"
                ? "Camera access needed"
                : "Something went wrong"}
            </h2>
            <p>
              {status === "camera-denied"
                ? "Draw on Hand draws with your hand, so it needs your camera. Allow camera access in the browser's address bar, then try again."
                : "Hand tracking could not start. Check your connection and GPU support, then try again."}
            </p>
            <button className="retry-btn" onClick={() => location.reload()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {flashKey > 0 && <div key={flashKey} className="flash" />}
    </div>
  );
}
