import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";
import { ActionsPanel } from "./components/ActionsPanel";
import { RadialDock } from "./components/RadialDock";
import { TopBar } from "./components/TopBar";
import { MaskWidget } from "./components/MaskWidget";
import { Onboarding } from "./components/Onboarding";
import { StatusOverlays } from "./components/StatusOverlays";
import { Toasts, type ToastItem, type ToastKind } from "./components/Toasts";
import { savePng, type SaveMode } from "./lib/capture";
import { drawCursor } from "./lib/cursor";
import {
  GestureEngine,
  MAX_PINCH_RATIO,
  MIN_PINCH_RATIO,
  type PinchConfig,
} from "./lib/gestures";
import { HandUiController, isOverUi, type UiState } from "./lib/handUi";
import {
  applyDefEdit,
  pickDefHandle,
  snapshotDefEdit,
  type DefEditMode,
  type MaskDefBox,
} from "./lib/maskDefBox";
import {
  drawDefOverlay,
  drawLaserTrail,
  drawMaskLayer,
  drawNoseDot,
  drawSelectedMaskBox,
  drawSymmetryGuides,
  type LaserPoint,
} from "./lib/overlays";
import { drawHandSkeleton } from "./lib/skeleton";
import {
  loadDrawingHand,
  loadPinchRatio,
  loadSavedMasks,
  loadSavedStrokes,
  loadString,
  removeStored,
  saveJson,
  saveString,
  STORAGE_KEYS,
} from "./lib/storage";
import {
  createHandLandmarker,
  startCamera,
  videoPointToCanvas,
} from "./lib/tracking";
import {
  createFaceLandmarker,
  getFaceTransform,
  getMaskHandles,
  screenDeltaToFaceDelta,
  type FaceTransform,
} from "./lib/faceTracking";
import { drawStroke, eraseSegment } from "./lib/strokes";
import type {
  AppStatus,
  Stroke,
  SymmetryMode,
  Tool,
  MaskLayer,
  MaskStroke,
} from "./types";

const DEFAULT_TOOL: Tool = { style: "pen", color: "#22d3ee", size: 10 };

/** How long a laser-pointer trail stays on screen (ms). */
const LASER_TTL = 750;

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
  /** fading laser-pointer trail (never committed as a stroke) */
  laser: LaserPoint[];
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  const strokesRef = useRef<Stroke[]>([]);
  /** strokes undone and waiting for a possible redo */
  const redoRef = useRef<Stroke[]>([]);
  const pinchConfigRef = useRef<PinchConfig>({ ratioStart: loadPinchRatio() });
  const handsRef = useRef(new Map<string, HandState>());
  const uiRef = useRef(new HandUiController());
  /** which hand currently drives the UI controller */
  const uiHandRef = useRef<string | null>(null);
  const toolRef = useRef<Tool>(DEFAULT_TOOL);
  const handPresentRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const [tool, setTool] = useState<Tool>(DEFAULT_TOOL);
  const [symmetry, setSymmetry] = useState<SymmetryMode>("off");
  const symmetryRef = useRef<SymmetryMode>("off");
  useEffect(() => {
    symmetryRef.current = symmetry;
  }, [symmetry]);
  const [status, setStatus] = useState<AppStatus>("loading-model");
  const [handPresent, setHandPresent] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => loadString(STORAGE_KEYS.onboarded) !== "1",
  );
  const [cameraVisible, setCameraVisible] = useState(true);
  const [flashKey, setFlashKey] = useState(0);
  const [fps, setFps] = useState(0);
  const [pinchRatio, setPinchRatio] = useState(
    pinchConfigRef.current.ratioStart,
  );
  const [drawingHand, setDrawingHand] = useState<"Left" | "Right">(
    loadDrawingHand,
  );


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

  const [masks, setMasks] = useState<MaskLayer[]>(loadSavedMasks);
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const [maskWidgetOpen, setMaskWidgetOpen] = useState(false);
  const [maskWidgetPos, setMaskWidgetPos] = useState<{ x: number; y: number } | null>(null);

  const maskWidgetOpenRef = useRef(false);
  useEffect(() => {
    maskWidgetOpenRef.current = maskWidgetOpen;
  }, [maskWidgetOpen]);

  const [maskDefinition, setMaskDefinition] = useState<MaskDefBox>({
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

  const defEditStateRef = useRef<
    ReturnType<typeof snapshotDefEdit> & {
      activeHandKey: string | null;
      startX: number;
      startY: number;
    }
  >({
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

  const toastIdRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (
      text: string,
      opts?: {
        kind?: ToastKind;
        actionLabel?: string;
        onAction?: () => void;
        duration?: number;
      },
    ) => {
      const id = ++toastIdRef.current;
      setToasts((t) => [
        ...t.slice(-2),
        {
          id,
          text,
          kind: opts?.kind ?? "info",
          actionLabel: opts?.actionLabel,
          onAction: opts?.onAction,
        },
      ]);
      window.setTimeout(() => dismissToast(id), opts?.duration ?? 5200);
    },
    [dismissToast],
  );

  const dismissOnboarding = useCallback(() => {
    setOnboardingOpen(false);
    saveString(STORAGE_KEYS.onboarded, "1");
  }, []);

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

    const beginDrag = (
      onMove: (evt: PointerEvent) => void,
      onEnd: () => void,
    ) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const target = e.currentTarget;
      const pointerId = e.pointerId;
      const handleUp = () => {
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // pointer already released
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", handleUp);
        onEnd();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", handleUp);
    };

    if (maskDefinition.active) {
      const mode = pickDefHandle(clickX, clickY, maskDefinition, w, h, 25);
      if (mode === "idle") return;

      defEditStateRef.current = {
        ...snapshotDefEdit(mode, maskDefinition),
        activeHandKey: null,
        startX: clickX,
        startY: clickY,
      };

      beginDrag(
        (moveEvt) => {
          const edit = defEditStateRef.current;
          const dx = (moveEvt.clientX - rect.left - edit.startX) / w;
          const dy = (moveEvt.clientY - rect.top - edit.startY) / h;
          const updates = applyDefEdit(edit, dx, dy);
          if (updates) setMaskDefinition((d) => ({ ...d, ...updates }));
        },
        () => {
          defEditStateRef.current.mode = "idle";
        },
      );
      return;
    }

    const face = lastFaceTransformRef.current;
    if (!selectedMaskId || !face) return;
    const selectedMask = masks.find((m) => m.id === selectedMaskId);
    if (!selectedMask || !selectedMask.visible) return;

    const handles = getMaskHandles(selectedMask, face, w, h);
    if (!handles) return;

    const distToCenter = Math.hypot(clickX - handles.cx, clickY - handles.cy);
    const distToScale = Math.hypot(clickX - handles.sx, clickY - handles.sy);

    const mode: "idle" | "drag" | "scale" =
      distToCenter < 35 ? "drag" : distToScale < 35 ? "scale" : "idle";
    if (mode === "idle") return;

    mouseEditStateRef.current = {
      mode,
      startHandX: clickX,
      startHandY: clickY,
      startOffsetX: selectedMask.offsetX,
      startOffsetY: selectedMask.offsetY,
      startScale: selectedMask.scale,
      startDist: distToCenter,
    };

    beginDrag(
      (moveEvt) => {
        const curX = moveEvt.clientX - rect.left;
        const curY = moveEvt.clientY - rect.top;
        const currentFace = lastFaceTransformRef.current;
        if (!currentFace) return;
        const edit = mouseEditStateRef.current;

        if (edit.mode === "drag") {
          const { dfx, dfy } = screenDeltaToFaceDelta(
            curX - edit.startHandX,
            curY - edit.startHandY,
            w,
            h,
            currentFace,
          );
          handleUpdateMask(selectedMask.id, {
            offsetX: edit.startOffsetX + dfx,
            offsetY: edit.startOffsetY + dfy,
          });
        } else if (edit.mode === "scale" && edit.startDist > 5) {
          const curDist = Math.hypot(curX - handles.cx, curY - handles.cy);
          const newScale = Math.min(
            2.5,
            Math.max(0.3, edit.startScale * (curDist / edit.startDist)),
          );
          handleUpdateMask(selectedMask.id, { scale: newScale });
        }
      },
      () => {
        mouseEditStateRef.current.mode = "idle";
      },
    );
  }, [masks, selectedMaskId, maskDefinition, handleUpdateMask]);

  const handleDrawingHandChange = useCallback((hand: "Left" | "Right") => {
    setDrawingHand(hand);
    saveString(STORAGE_KEYS.drawingHand, hand);
  }, []);

  const handlePinchRatio = useCallback((value: number) => {
    const v = Math.min(MAX_PINCH_RATIO, Math.max(MIN_PINCH_RATIO, value));
    pinchConfigRef.current.ratioStart = v;
    setPinchRatio(v);
    saveString(STORAGE_KEYS.pinchRatio, String(v));
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
    // A fresh stroke invalidates the redo history.
    if (redoRef.current.length > 0) {
      redoRef.current = [];
      setRedoCount(0);
    }
  }, []);

  // ---------- Tracking pipeline ----------

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let landmarker: HandLandmarker | null = null;
    let faceLandmarker: FaceLandmarker | null = null;
    let stream: MediaStream | null = null;

    // FPS meter: counted per processed frame, published twice a second.
    let frameCount = 0;
    let fpsWindowStart = performance.now();

    const handleFrame = () => {
      const video = videoRef.current;
      const live = liveRef.current;
      const base = baseRef.current;
      if (!video || !live || !base || !landmarker) return;

      const timestamp = performance.now();
      const result = landmarker.detectForVideo(video, timestamp);

      // Face tracking is only paid for when something actually uses it:
      // visible masks, the definition box, or the Mask Studio being open.
      const needFace =
        masksRef.current.length > 0 ||
        maskDefinitionRef.current.active ||
        maskWidgetOpenRef.current;
      const faceResult = needFace
        ? faceLandmarker?.detectForVideo(video, timestamp)
        : undefined;

      frameCount++;
      if (timestamp - fpsWindowStart >= 500) {
        setFps(Math.round((frameCount * 1000) / (timestamp - fpsWindowStart)));
        frameCount = 0;
        fpsWindowStart = timestamp;
      }

      const lctx = live.getContext("2d");
      const bctx = base.getContext("2d");
      if (!lctx || !bctx) return;

      const w = live.clientWidth;
      const h = live.clientHeight;
      lctx.clearRect(0, 0, w, h);

      drawSymmetryGuides(lctx, symmetryRef.current, w, h);

      // 1. Face tracking → AR masks + edit handles.
      let faceTransform: FaceTransform | null = null;
      if (faceResult && faceResult.faceLandmarks.length > 0) {
        faceTransform = getFaceTransform(
          faceResult.faceLandmarks[0],
          video.videoWidth,
          video.videoHeight,
          w,
          h,
        );
      }
      lastFaceTransformRef.current = faceTransform;

      if (faceTransform) {
        drawNoseDot(lctx, faceTransform, w, h);

        for (const mask of masksRef.current) {
          if (mask.visible) drawMaskLayer(lctx, mask, faceTransform, w, h);
        }

        const selectedMask = masksRef.current.find(
          (m) => m.id === selectedMaskIdRef.current,
        );
        if (selectedMask?.visible) {
          drawSelectedMaskBox(lctx, selectedMask, faceTransform, w, h);
        }
      }

      // 1.5 Mask-definition overlay.
      if (maskDefinitionRef.current.active) {
        drawDefOverlay(lctx, maskDefinitionRef.current, defHoverRef.current, w, h);
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
            laser: [],
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

          if (defEditStateRef.current.mode === "idle") {
            // What the fingertip is aiming at right now (generous radius).
            const near = f.overUi
              ? "idle"
              : pickDefHandle(f.pt.x, f.pt.y, md, w, h, 70);
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
                ...snapshotDefEdit(aim, md),
                activeHandKey: f.key,
                startX: f.pt.x,
                startY: f.pt.y,
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

              const edit = defEditStateRef.current;
              const updates = applyDefEdit(
                edit,
                (f.pt.x - edit.startX) / w,
                (f.pt.y - edit.startY) / h,
              );
              if (updates) setMaskDefinition((d) => ({ ...d, ...updates }));
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
          const handles =
            selectedMask && selectedMask.visible
              ? getMaskHandles(selectedMask, faceTransform, w, h)
              : null;
          if (selectedMask && handles) {
            const distToCenter = Math.hypot(f.pt.x - handles.cx, f.pt.y - handles.cy);
            const distToScale = Math.hypot(f.pt.x - handles.sx, f.pt.y - handles.sy);

            if (maskEditStateRef.current.mode === "idle") {
              if (f.justPinched && (distToCenter < 52 || distToScale < 52)) {
                const grabScale = distToCenter >= 52;
                maskEditStateRef.current = {
                  mode: grabScale ? "scale" : "drag",
                  activeHandKey: f.key,
                  startHandX: f.pt.x,
                  startHandY: f.pt.y,
                  startOffsetX: selectedMask.offsetX,
                  startOffsetY: selectedMask.offsetY,
                  startScale: selectedMask.scale,
                  startDist: grabScale ? distToCenter : 0,
                };
                f.state.pinchFromUi = true;
                maskIntercept = true;
              }
            } else if (maskEditStateRef.current.activeHandKey === f.key) {
              if (f.hand.pinching) {
                f.state.pinchFromUi = true;
                maskIntercept = true;
                const edit = maskEditStateRef.current;

                if (edit.mode === "drag") {
                  const { dfx, dfy } = screenDeltaToFaceDelta(
                    f.pt.x - edit.startHandX,
                    f.pt.y - edit.startHandY,
                    w,
                    h,
                    faceTransform,
                  );
                  handleUpdateMask(selectedMask.id, {
                    offsetX: edit.startOffsetX + dfx,
                    offsetY: edit.startOffsetY + dfy,
                  });
                } else if (edit.mode === "scale" && edit.startDist > 10) {
                  const curDist = Math.hypot(f.pt.x - handles.cx, f.pt.y - handles.cy);
                  const newScale = Math.min(
                    2.5,
                    Math.max(0.3, edit.startScale * (curDist / edit.startDist)),
                  );
                  handleUpdateMask(selectedMask.id, { scale: newScale });
                }
              } else {
                maskEditStateRef.current.mode = "idle";
                maskEditStateRef.current.activeHandKey = null;
              }
            }
          }
        }

        const blocked = handUiState.overUi || f.state.pinchFromUi || maskIntercept || defIntercept;

        if (f.hand.pinching && !blocked && handStyle === "laser") {
          // Laser pointer: a fading trail on the live layer only — nothing
          // is ever committed, so it's safe for presentations over artwork.
          f.state.laser.push({ x: f.pt.x, y: f.pt.y, t: timestamp });
          if (!hasDrawnRef.current) {
            hasDrawnRef.current = true;
            setHasDrawn(true);
          }
        } else if (f.hand.pinching && !blocked) {
          let stroke = f.state.stroke;
          if (!stroke) {
            const sym = symmetryRef.current;
            stroke = {
              style: handStyle,
              color: handColor,
              size: t.size,
              points: [],
              ...(sym !== "off" ? { sym } : {}),
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
          t,
        );
      }

      // Fading laser-pointer trails (keep fading after the pinch releases).
      for (const state of handsRef.current.values()) {
        if (state.laser.length === 0) continue;
        state.laser = state.laser.filter((p) => timestamp - p.t < LASER_TTL);
        drawLaserTrail(lctx, state.laser, t.color, t.size, timestamp, LASER_TTL);
      }

      // Publish this frame's handle hover for the next overlay draw.
      defHoverRef.current = maskDefinitionRef.current.active ? nextDefHover : null;
    };

    const init = async () => {
      try {
        setStatus("loading-model");
        // Both models load in parallel — they share the same WASM runtime
        // fetch, so this nearly halves cold-start time.
        [landmarker, faceLandmarker] = await Promise.all([
          createHandLandmarker(),
          createFaceLandmarker(),
        ]);
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
    const stroke = strokesRef.current.pop();
    if (!stroke) return;
    redoRef.current.push(stroke);
    setRedoCount(redoRef.current.length);
    setStrokeCount(strokesRef.current.length);
    replay();
  }, [replay]);

  const redo = useCallback(() => {
    const stroke = redoRef.current.pop();
    if (!stroke) return;
    strokesRef.current.push(stroke);
    setRedoCount(redoRef.current.length);
    setStrokeCount(strokesRef.current.length);
    replay();
  }, [replay]);

  const clearAll = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    // Keep the cleared strokes so the toast can restore them (forgiveness
    // for a destructive action that can be triggered by a stray pinch).
    const snapshot = strokesRef.current;
    strokesRef.current = [];
    redoRef.current = [];
    setRedoCount(0);
    for (const state of handsRef.current.values()) {
      state.stroke = null;
    }
    setStrokeCount(0);
    replay();
    showToast("ล้างภาพวาดทั้งหมดแล้ว", {
      actionLabel: "กู้คืน",
      onAction: () => {
        strokesRef.current = snapshot;
        setStrokeCount(snapshot.length);
        replay();
      },
    });
  }, [replay, showToast]);

  const cycleSymmetry = useCallback(() => {
    setSymmetry((s) => {
      const next: SymmetryMode =
        s === "off" ? "mirror" : s === "mirror" ? "kaleido" : "off";
      showToast(
        next === "off"
          ? "ปิดโหมดสมมาตร"
          : next === "mirror"
            ? "โหมดกระจก: เส้นจะสะท้อนซ้าย–ขวาอัตโนมัติ"
            : "โหมดคาไลโดสโคป: เส้นจะหมุนซ้ำ 4 ทิศรอบกลางจอ",
        { duration: 2200 },
      );
      return next;
    });
  }, [showToast]);

  const replayAnimRef = useRef(0);

  /** Re-draws the artwork stroke-by-stroke as a short animation. */
  const replayAnimation = useCallback(() => {
    const base = baseRef.current;
    const ctx = base?.getContext("2d");
    if (!base || !ctx) return;
    const strokes = [...strokesRef.current];
    if (strokes.length === 0) return;
    cancelAnimationFrame(replayAnimRef.current);

    const w = base.clientWidth;
    const h = base.clientHeight;
    const counts = strokes.map((s) => Math.max(1, s.points.length));
    const total = counts.reduce((a, b) => a + b, 0);
    const duration = Math.min(6000, Math.max(1600, total * 6));
    const start = performance.now();

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      let budget = Math.max(1, Math.floor(total * p));
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < strokes.length && budget > 0; i++) {
        const s = strokes[i];
        const n = counts[i];
        if (budget >= n) {
          drawStroke(ctx, s, w, h);
          budget -= n;
        } else {
          drawStroke(ctx, { ...s, points: s.points.slice(0, budget) }, w, h);
          budget = 0;
        }
      }
      if (p < 1) {
        replayAnimRef.current = requestAnimationFrame(step);
      } else {
        // Final exact redraw (also restores strokes committed mid-animation).
        replay();
      }
    };
    replayAnimRef.current = requestAnimationFrame(step);
  }, [replay]);

  // Autosave the artwork (debounced) so a refresh never loses work.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (strokesRef.current.length === 0) {
        removeStored(STORAGE_KEYS.artwork);
      } else {
        saveJson(STORAGE_KEYS.artwork, strokesRef.current);
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [strokeCount]);

  // Persist face masks the same way.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (masks.length === 0) {
        removeStored(STORAGE_KEYS.masks);
      } else {
        saveJson(STORAGE_KEYS.masks, masks);
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [masks]);

  // Restore the previous session's artwork once on startup.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadSavedStrokes();
    if (saved.length === 0) return;
    strokesRef.current = saved;
    setStrokeCount(saved.length);
    requestAnimationFrame(() => replay());
    showToast("กู้คืนผลงานจากครั้งก่อนแล้ว", {
      actionLabel: "เริ่มใหม่",
      onAction: clearAll,
    });
  }, [replay, showToast, clearAll]);

  const handleSave = useCallback((mode: SaveMode) => {
    const base = baseRef.current;
    if (!base) return;
    const ctx = base.getContext("2d");
    const face = lastFaceTransformRef.current;
    const w = base.clientWidth;
    const h = base.clientHeight;

    // Draw active masks onto the base canvas before saving
    if (ctx && face) {
      for (const mask of masks) {
        if (mask.visible) drawMaskLayer(ctx, mask, face, w, h);
      }
    }

    savePng(base, videoRef.current, mode);
    setFlashKey((k) => k + 1);

    // Replay to clear the temporary masks off the base canvas
    replay();
    showToast("บันทึกรูปภาพ PNG ลงเครื่องแล้ว", { kind: "success" });
  }, [masks, replay, showToast]);

  const startMaskDefinition = useCallback(() => {
    if (strokesRef.current.length === 0) {
      showToast("วาดลายเส้นบนหน้าจอก่อน แล้วค่อยกดสร้างหน้ากาก", {
        kind: "error",
      });
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
  }, [showToast]);

  const confirmBakeMask = useCallback(() => {
    const face = lastFaceTransformRef.current;
    if (!face) {
      showToast("ไม่พบใบหน้าในกล้อง — ขยับหน้าให้อยู่ในจอแล้วลองอีกครั้ง", {
        kind: "error",
      });
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
      showToast("ไม่พบลายเส้นในขอบเขตที่เลือก — ขยายกรอบให้ครอบคลุมรูปวาด", {
        kind: "error",
      });
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
    showToast(`สร้าง "${newMask.name}" แล้ว — หน้ากากจะขยับตามใบหน้าของคุณ`, {
      kind: "success",
    });
  }, [maskDefinition, masks.length, replay, showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (key === "z") {
        e.preventDefault();
        undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---------- Render ----------

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

      <TopBar status={status} handPresent={handPresent} fps={fps} />

      <ActionsPanel
        innerRef={actionsRef}
        pos={actionsPos}
        onMove={(dx, dy) => movePanel("actions", dx, dy)}
        canUndo={strokeCount > 0}
        canRedo={redoCount > 0}
        cameraVisible={cameraVisible}
        pinchRatio={pinchRatio}
        onPinchRatio={handlePinchRatio}
        onUndo={undo}
        onRedo={redo}
        onClear={clearAll}
        onToggleCamera={() => setCameraVisible((v) => !v)}
        onSave={handleSave}
        symmetry={symmetry}
        onCycleSymmetry={cycleSymmetry}
        onReplayAnimation={replayAnimation}
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

      {status === "ready" && !hasDrawn && !onboardingOpen && (
        <div className="hint glass">
          <span className="emoji">🤏</span>
          จีบนิ้วโป้งกับนิ้วชี้เพื่อวาด — ชี้ที่ปุ่มแล้วจีบเพื่อคลิก
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

      {status === "ready" && onboardingOpen && (
        <Onboarding onDismiss={dismissOnboarding} />
      )}

      <StatusOverlays status={status} />

      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {flashKey > 0 && <div key={flashKey} className="flash" />}
    </div>
  );
}
