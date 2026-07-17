import type { CSSProperties } from "react";
import type { BrushStyle, Tool } from "../types";
import { usePointerDrag } from "../lib/useDrag";
import {
  CloseIcon,
  EraserIcon,
  MarkerIcon,
  NeonIcon,
  PenIcon,
  RainbowIcon,
} from "./icons";

const PRESET_COLORS = [
  "#f8fafc",
  "#f87171",
  "#fb923c",
  "#facc15",
  "#34d399",
  "#22d3ee",
  "#818cf8",
  "#f472b6",
];

const SIZES = [4, 8, 12, 18, 26, 34];

const BRUSHES: { style: BrushStyle; label: string; icon: () => JSX.Element }[] = [
  { style: "pen", label: "Pen", icon: PenIcon },
  { style: "neon", label: "Neon", icon: NeonIcon },
  { style: "marker", label: "Marker", icon: MarkerIcon },
  { style: "rainbow", label: "Rainbow", icon: RainbowIcon },
  { style: "eraser", label: "Eraser", icon: EraserIcon },
];

const INNER_R = 76;
const OUTER_R = 136;

/** Position an item on its ring; --tx/--ty and a stagger delay drive the
 * expand/collapse animation in CSS. */
function ringStyle(angleDeg: number, radius: number, order: number): CSSProperties {
  const a = (angleDeg * Math.PI) / 180;
  return {
    "--tx": `${Math.cos(a) * radius}px`,
    "--ty": `${Math.sin(a) * radius}px`,
    "--delay": `${order * 16}ms`,
  } as CSSProperties;
}

interface RadialDockProps {
  tool: Tool;
  onChange: (tool: Tool) => void;
  expanded: boolean;
  onToggle: () => void;
  pos: { x: number; y: number };
  onMove: (dx: number, dy: number) => void;
}

/**
 * Circular tool dock: a draggable hub that fans two rings of controls out
 * around itself — brush styles on the inner ring, colors and stroke sizes on
 * the outer ring. Pinch (or click) the hub to expand/collapse; pinch-hold
 * and move (or mouse-drag) to reposition it anywhere on screen.
 */
export function RadialDock({
  tool,
  onChange,
  expanded,
  onToggle,
  pos,
  onMove,
}: RadialDockProps) {
  const drag = usePointerDrag(onMove);
  const isPreset = PRESET_COLORS.includes(tool.color);

  const previewColor =
    tool.style === "eraser"
      ? "#94a3b8"
      : tool.style === "rainbow"
        ? "conic-gradient(#f87171, #facc15, #34d399, #22d3ee, #818cf8, #f472b6, #f87171)"
        : tool.color;
  const previewSize = Math.max(10, Math.min(30, tool.size * 0.8));

  // Outer ring: 8 colors + custom picker + 6 sizes = 15 items, evenly spaced.
  const outerStep = 360 / (PRESET_COLORS.length + 1 + SIZES.length);

  return (
    <div
      className="dock"
      data-expanded={expanded}
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="dock-ring"
        style={{ width: INNER_R * 2, height: INNER_R * 2 }}
      />
      <div
        className="dock-ring"
        style={{ width: OUTER_R * 2, height: OUTER_R * 2 }}
      />

      {/* Inner ring: brush styles */}
      {BRUSHES.map(({ style, label, icon: Icon }, i) => (
        <div
          key={style}
          className="dock-item"
          style={ringStyle(-90 + i * (360 / BRUSHES.length), INNER_R, i)}
        >
          <button
            className={`dock-btn${tool.style === style ? " active" : ""}`}
            title={label}
            aria-label={`Brush: ${label}`}
            onClick={() => onChange({ ...tool, style })}
          >
            <Icon />
          </button>
        </div>
      ))}

      {/* Outer ring: colors, custom picker, then sizes */}
      {PRESET_COLORS.map((c, i) => (
        <div
          key={c}
          className="dock-item"
          style={ringStyle(-90 + i * outerStep, OUTER_R, BRUSHES.length + i)}
        >
          <button
            className={`swatch${tool.color === c ? " active" : ""}`}
            style={{ background: c, "--swatch-glow": c } as CSSProperties}
            aria-label={`Color ${c}`}
            onClick={() => onChange({ ...tool, color: c })}
          />
        </div>
      ))}

      <div
        className="dock-item"
        style={ringStyle(
          -90 + PRESET_COLORS.length * outerStep,
          OUTER_R,
          BRUSHES.length + PRESET_COLORS.length,
        )}
      >
        <label
          className={`swatch-custom${!isPreset ? " active" : ""}`}
          title="Custom color"
        >
          <span
            className="inner"
            style={{ "--current": tool.color } as CSSProperties}
          />
          <input
            type="color"
            value={tool.color}
            onChange={(e) => onChange({ ...tool, color: e.target.value })}
          />
        </label>
      </div>

      {SIZES.map((s, i) => (
        <div
          key={s}
          className="dock-item"
          style={ringStyle(
            -90 + (PRESET_COLORS.length + 1 + i) * outerStep,
            OUTER_R,
            BRUSHES.length + PRESET_COLORS.length + 1 + i,
          )}
        >
          <button
            className={`size-btn${tool.size === s ? " active" : ""}`}
            title={`Size ${s}px`}
            aria-label={`Brush size ${s} pixels`}
            onClick={() => onChange({ ...tool, size: s })}
          >
            <span
              className="size-dot"
              style={{
                width: Math.min(s * 0.75, 26),
                height: Math.min(s * 0.75, 26),
              }}
            />
          </button>
        </div>
      ))}

      {/* Hub: tap to expand/collapse, hold & move to drag the dock */}
      <button
        className="dock-hub"
        data-drag="dock"
        title={expanded ? "ย่อเมนูเครื่องมือ (ลากเพื่อย้าย)" : "เปิดเมนูเครื่องมือ (ลากเพื่อย้าย)"}
        onPointerDown={drag.onPointerDown}
        onClick={() => {
          if (!drag.wasDragged()) onToggle();
        }}
      >
        <span className="hub-face preview">
          <span
            className="hub-dot"
            style={{
              width: previewSize,
              height: previewSize,
              background: previewColor,
            }}
          />
        </span>
        <span className="hub-face close">
          <CloseIcon />
        </span>
      </button>
    </div>
  );
}
