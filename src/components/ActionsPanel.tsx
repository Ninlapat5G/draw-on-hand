import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  DEFAULT_PINCH_RATIO,
  MAX_PINCH_RATIO,
  MIN_PINCH_RATIO,
} from "../lib/gestures";
import { usePointerDrag } from "../lib/useDrag";
import {
  CameraIcon,
  CameraOffIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  GripIcon,
  ImageIcon,
  LayersIcon,
  SettingsIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";

interface ActionsPanelProps {
  innerRef: RefObject<HTMLDivElement>;
  pos: { x: number; y: number } | null;
  onMove: (dx: number, dy: number) => void;
  canUndo: boolean;
  cameraVisible: boolean;
  pinchRatio: number;
  onPinchRatio: (value: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onToggleCamera: () => void;
  onSave: (includeCamera: boolean) => void;
}

/**
 * Floating action panel (undo / clear / camera / save / pinch settings).
 * Draggable by its grip — mouse or pinch-hold — and collapsible to a pill.
 */
export function ActionsPanel({
  innerRef,
  pos,
  onMove,
  canUndo,
  cameraVisible,
  pinchRatio,
  onPinchRatio,
  onUndo,
  onClear,
  onToggleCamera,
  onSave,
}: ActionsPanelProps) {
  const drag = usePointerDrag(onMove);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !settingsOpen) return;
    const close = (e: PointerEvent) => {
      if (menuOpen && !menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (settingsOpen && !settingsRef.current?.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen, settingsOpen]);

  return (
    <div
      ref={innerRef}
      className="actions-panel glass"
      data-collapsed={collapsed}
      style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
    >
      <button
        className="icon-btn grip"
        data-drag="actions"
        title="Move panel (drag)"
        onPointerDown={drag.onPointerDown}
        onClick={(e) => e.preventDefault()}
      >
        <GripIcon />
      </button>

      <div className="panel-items">
        <button
          className="icon-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <UndoIcon />
        </button>
        <button
          className="icon-btn danger"
          onClick={onClear}
          disabled={!canUndo}
          title="Clear canvas"
        >
          <TrashIcon />
        </button>
        <button
          className="icon-btn"
          onClick={onToggleCamera}
          title={cameraVisible ? "Hide camera" : "Show camera"}
        >
          {cameraVisible ? <CameraIcon /> : <CameraOffIcon />}
        </button>

        <div className="save-wrap" ref={menuRef}>
          <button className="save-btn" onClick={() => setMenuOpen((v) => !v)}>
            <DownloadIcon />
            Save
          </button>
          {menuOpen && (
            <div className="save-menu">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onSave(true);
                }}
              >
                <ImageIcon />
                <span>
                  With camera photo
                  <span className="menu-sub">Your drawing over the snapshot</span>
                </span>
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onSave(false);
                }}
              >
                <LayersIcon />
                <span>
                  Drawing only
                  <span className="menu-sub">Strokes on a dark backdrop</span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Outside .panel-items so the popover isn't clipped by the collapse
          animation's overflow: hidden, and settings stay reachable even
          while the panel is collapsed. */}
      <div className="save-wrap" ref={settingsRef}>
        <button
          className="icon-btn"
          onClick={() => setSettingsOpen((v) => !v)}
          title="Pinch settings"
        >
          <SettingsIcon />
        </button>
        {settingsOpen && (
          <div className="save-menu settings-menu">
            <div className="settings-row">
              <span className="settings-label">Pinch distance</span>
              <span className="settings-value">
                {(pinchRatio * 100).toFixed(0)}
              </span>
            </div>
            <input
              className="settings-slider"
              type="range"
              min={MIN_PINCH_RATIO}
              max={MAX_PINCH_RATIO}
              step={0.01}
              value={pinchRatio}
              aria-label="Pinch trigger distance"
              onChange={(e) => onPinchRatio(Number(e.target.value))}
            />
            <div className="settings-scale">
              <span>Strict</span>
              <span>Easy</span>
            </div>
            <p className="settings-hint">
              How close your thumb &amp; index tips must get to click or draw.
            </p>
            <button
              className="settings-reset"
              onClick={() => onPinchRatio(DEFAULT_PINCH_RATIO)}
            >
              Reset to default
            </button>
          </div>
        )}
      </div>

      <button
        className="icon-btn collapse-btn"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? "Expand panel" : "Collapse panel"}
      >
        {collapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </button>
    </div>
  );
}
