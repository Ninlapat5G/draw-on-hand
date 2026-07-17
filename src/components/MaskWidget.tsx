import type { CSSProperties, RefObject } from "react";
import type { MaskLayer } from "../types";
import { usePointerDrag } from "../lib/useDrag";
import {
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  GripIcon,
  TrashIcon,
} from "./icons";

interface MaskWidgetProps {
  innerRef: RefObject<HTMLDivElement>;
  pos: { x: number; y: number } | null;
  onMove: (dx: number, dy: number) => void;
  masks: MaskLayer[];
  selectedMaskId: string | null;
  onSelectMask: (id: string | null) => void;
  onToggleVisible: (id: string) => void;
  onDeleteMask: (id: string) => void;
  onUpdateMask: (id: string, updates: Partial<MaskLayer>) => void;
  onClose: () => void;
}

export function MaskWidget({
  innerRef,
  pos,
  onMove,
  masks,
  selectedMaskId,
  onSelectMask,
  onToggleVisible,
  onDeleteMask,
  onUpdateMask,
  onClose,
}: MaskWidgetProps) {
  const drag = usePointerDrag(onMove);
  const selectedMask = masks.find((m) => m.id === selectedMaskId);

  return (
    <div
      ref={innerRef}
      className="mask-widget glass"
      style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
    >
      {/* Header with drag grip */}
      <div className="widget-header">
        <button
          className="icon-btn grip"
          data-drag="mask"
          title="ย้ายแผง (ลาก)"
          onPointerDown={drag.onPointerDown}
          onClick={(e) => e.preventDefault()}
        >
          <GripIcon />
        </button>
        <span className="widget-title">Mask Studio</span>
        <button className="icon-btn close-btn" onClick={onClose} title="ปิดแผง">
          <CloseIcon />
        </button>
      </div>

      <div className="widget-content">
        {/* Mask Layers List */}
        <div className="mask-section">
          <div className="section-title">หน้ากากทั้งหมด</div>
          {masks.length === 0 ? (
            <p className="no-masks-hint">
              ยังไม่มีหน้ากาก AR<br />
              วาดรูปบนหน้าจอ แล้วกดปุ่มหน้ากากในแผงเครื่องมือเพื่อติดภาพวาดเข้ากับใบหน้า
            </p>
          ) : (
            <div className="mask-list">
              {masks.map((mask) => (
                <div
                  key={mask.id}
                  className={`mask-item ${selectedMaskId === mask.id ? "active" : ""}`}
                  onClick={() => onSelectMask(mask.id)}
                >
                  <span className="mask-name">{mask.name}</span>
                  <div className="mask-item-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`icon-btn ${mask.visible ? "visible" : "hidden"}`}
                      onClick={() => onToggleVisible(mask.id)}
                      title={mask.visible ? "ซ่อนหน้ากาก" : "แสดงหน้ากาก"}
                    >
                      {mask.visible ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => {
                        onDeleteMask(mask.id);
                        if (selectedMaskId === mask.id) {
                          onSelectMask(null);
                        }
                      }}
                      title="ลบหน้ากาก"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customization controls for selected mask */}
        {selectedMask && (
          <div className="mask-section controls-section">
            <div className="section-title">ปรับแต่ง: {selectedMask.name}</div>

            {/* Scale Slider */}
            <div className="settings-row">
              <span className="settings-label">ขนาด</span>
              <span className="settings-value">
                {selectedMask.scale.toFixed(2)}x
              </span>
            </div>
            <input
              className="settings-slider"
              type="range"
              min="0.3"
              max="2.5"
              step="0.05"
              value={selectedMask.scale}
              onChange={(e) =>
                onUpdateMask(selectedMask.id, { scale: Number(e.target.value) })
              }
            />

            {/* Offset X Slider */}
            <div className="settings-row">
              <span className="settings-label">เลื่อนแนวนอน</span>
              <span className="settings-value">
                {selectedMask.offsetX > 0 ? "+" : ""}
                {selectedMask.offsetX.toFixed(2)}
              </span>
            </div>
            <input
              className="settings-slider"
              type="range"
              min="-2.0"
              max="2.0"
              step="0.05"
              value={selectedMask.offsetX}
              onChange={(e) =>
                onUpdateMask(selectedMask.id, { offsetX: Number(e.target.value) })
              }
            />

            {/* Offset Y Slider */}
            <div className="settings-row">
              <span className="settings-label">เลื่อนแนวตั้ง</span>
              <span className="settings-value">
                {selectedMask.offsetY > 0 ? "+" : ""}
                {selectedMask.offsetY.toFixed(2)}
              </span>
            </div>
            <input
              className="settings-slider"
              type="range"
              min="-2.0"
              max="2.0"
              step="0.05"
              value={selectedMask.offsetY}
              onChange={(e) =>
                onUpdateMask(selectedMask.id, { offsetY: Number(e.target.value) })
              }
            />

            {/* Opacity Slider */}
            <div className="settings-row">
              <span className="settings-label">ความทึบ</span>
              <span className="settings-value">
                {(selectedMask.opacity * 100).toFixed(0)}%
              </span>
            </div>
            <input
              className="settings-slider"
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={selectedMask.opacity}
              onChange={(e) =>
                onUpdateMask(selectedMask.id, { opacity: Number(e.target.value) })
              }
            />

            {/* Mirror Mask Toggle */}
            <div className="settings-row mirror-row">
              <span className="settings-label">กลับด้านซ้าย–ขวา</span>
              <input
                type="checkbox"
                className="settings-checkbox"
                checked={selectedMask.mirror || false}
                onChange={(e) =>
                  onUpdateMask(selectedMask.id, { mirror: e.target.checked })
                }
              />
            </div>

            {/* Color override picker */}
            <div className="settings-row color-override-row" style={{ marginTop: "12px" }}>
              <span className="settings-label">สีทับลายเส้น</span>
              <div className="color-swatches">
                <button
                  className={`color-swatch original ${!selectedMask.colorOverride ? "active" : ""}`}
                  onClick={() => onUpdateMask(selectedMask.id, { colorOverride: undefined })}
                  title="สีดั้งเดิม"
                />
                {["#22d3ee", "#f43f5e", "#10b981", "#fbbf24", "#a855f7", "#ffffff"].map((color) => (
                  <button
                    key={color}
                    className={`color-swatch ${selectedMask.colorOverride === color ? "active" : ""}`}
                    onClick={() => onUpdateMask(selectedMask.id, { colorOverride: color })}
                    style={{ "--sw": color } as CSSProperties}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <button
              className="settings-reset"
              onClick={() =>
                onUpdateMask(selectedMask.id, {
                  scale: 1.0,
                  offsetX: 0.0,
                  offsetY: 0.0,
                  opacity: 1.0,
                  mirror: false,
                  colorOverride: undefined,
                })
              }
            >
              รีเซ็ตค่าทั้งหมด
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
