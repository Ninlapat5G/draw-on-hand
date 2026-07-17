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
  MaskIcon,
  RedoIcon,
  SettingsIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";

interface ActionsPanelProps {
  innerRef: RefObject<HTMLDivElement>;
  pos: { x: number; y: number } | null;
  onMove: (dx: number, dy: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  cameraVisible: boolean;
  pinchRatio: number;
  onPinchRatio: (value: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onToggleCamera: () => void;
  onSave: (includeCamera: boolean) => void;
  drawingHand: "Left" | "Right";
  onDrawingHandChange: (hand: "Left" | "Right") => void;
  onCreateMask: () => void;
  maskWidgetOpen: boolean;
  onToggleMaskWidget: () => void;
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
  canRedo,
  cameraVisible,
  pinchRatio,
  onPinchRatio,
  onUndo,
  onRedo,
  onClear,
  onToggleCamera,
  onSave,
  drawingHand,
  onDrawingHandChange,
  onCreateMask,
  maskWidgetOpen,
  onToggleMaskWidget,
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
        title="ย้ายแผงเครื่องมือ (ลาก)"
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
          title="ย้อนกลับ (Ctrl+Z)"
        >
          <UndoIcon />
        </button>
        <button
          className="icon-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="ทำซ้ำ (Ctrl+Y)"
        >
          <RedoIcon />
        </button>
        <button
          className="icon-btn danger"
          onClick={onClear}
          disabled={!canUndo}
          title="ล้างภาพวาดทั้งหมด"
        >
          <TrashIcon />
        </button>
        <button
          className="icon-btn"
          onClick={onToggleCamera}
          title={cameraVisible ? "ซ่อนภาพกล้อง" : "แสดงภาพกล้อง"}
        >
          {cameraVisible ? <CameraIcon /> : <CameraOffIcon />}
        </button>

        <button
          className="icon-btn"
          onClick={onCreateMask}
          disabled={!canUndo}
          title="สร้างหน้ากาก AR จากภาพวาด"
        >
          <MaskIcon />
        </button>

        <button
          className={`icon-btn ${maskWidgetOpen ? "active" : ""}`}
          onClick={onToggleMaskWidget}
          title="เปิด Mask Studio"
        >
          <LayersIcon />
        </button>

        <div className="save-wrap" ref={menuRef}>
          <button className="save-btn" onClick={() => setMenuOpen((v) => !v)}>
            <DownloadIcon />
            บันทึก
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
                  พร้อมภาพจากกล้อง
                  <span className="menu-sub">ลายเส้นซ้อนบนภาพถ่าย ณ ตอนนั้น</span>
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
                  เฉพาะลายเส้น
                  <span className="menu-sub">ลายเส้นบนพื้นหลังเข้ม</span>
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
          title="ตั้งค่าการจีบนิ้ว"
        >
          <SettingsIcon />
        </button>
        {settingsOpen && (
          <div className="save-menu settings-menu">
            <div className="settings-row">
              <span className="settings-label">ระยะการจีบนิ้ว</span>
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
              aria-label="ระยะการจีบนิ้วที่เริ่มทำงาน"
              onChange={(e) => onPinchRatio(Number(e.target.value))}
            />
            <div className="settings-scale">
              <span>แม่นยำ</span>
              <span>ง่าย</span>
            </div>
            <p className="settings-hint">
              ระยะที่นิ้วโป้งกับนิ้วชี้ต้องเข้าใกล้กันก่อนเริ่มวาดหรือคลิก
            </p>
            <div className="settings-row" style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px", alignItems: "center" }}>
              <span className="settings-label">มือที่ใช้วาด</span>
              <div className="hand-selector">
                <button
                  className={`selector-btn ${drawingHand === "Right" ? "active" : ""}`}
                  onClick={() => onDrawingHandChange("Right")}
                >
                  ขวา
                </button>
                <button
                  className={`selector-btn ${drawingHand === "Left" ? "active" : ""}`}
                  onClick={() => onDrawingHandChange("Left")}
                >
                  ซ้าย
                </button>
              </div>
            </div>
            <p className="settings-hint" style={{ marginBottom: "12px" }}>
              อีกมือหนึ่งจะกลายเป็นยางลบโดยอัตโนมัติ
            </p>
            <button
              className="settings-reset"
              onClick={() => onPinchRatio(DEFAULT_PINCH_RATIO)}
            >
              คืนค่าเริ่มต้น
            </button>
          </div>
        )}
      </div>

      <button
        className="icon-btn collapse-btn"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? "ขยายแผงเครื่องมือ" : "ย่อแผงเครื่องมือ"}
      >
        {collapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </button>
    </div>
  );
}
