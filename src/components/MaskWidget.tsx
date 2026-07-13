import { useRef } from "react";
import type { RefObject } from "react";
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
          title="Move panel (drag)"
          onPointerDown={drag.onPointerDown}
          onClick={(e) => e.preventDefault()}
        >
          <GripIcon />
        </button>
        <span className="widget-title">Mask Studio</span>
        <button className="icon-btn close-btn" onClick={onClose} title="Close Panel">
          <CloseIcon />
        </button>
      </div>

      <div className="widget-content">
        {/* Mask Layers List */}
        <div className="mask-section">
          <div className="section-title">Face Masks</div>
          {masks.length === 0 ? (
            <p className="no-masks-hint">
              No face masks created yet.<br />
              Draw something and click the mask button in the toolbar to bake it onto your face.
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
                      title={mask.visible ? "Hide Mask" : "Show Mask"}
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
                      title="Delete Mask"
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
            <div className="section-title">Customize: {selectedMask.name}</div>

            {/* Scale Slider */}
            <div className="settings-row">
              <span className="settings-label">Scale</span>
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
              <span className="settings-label">Offset X</span>
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
              <span className="settings-label">Offset Y</span>
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
              <span className="settings-label">Opacity</span>
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
              <span className="settings-label">Mirror mask</span>
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
              <span className="settings-label">Color Filter</span>
              <div className="color-swatches" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                <button
                  className={`color-swatch original ${!selectedMask.colorOverride ? "active" : ""}`}
                  onClick={() => onUpdateMask(selectedMask.id, { colorOverride: undefined })}
                  title="Original Color"
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.2)",
                    cursor: "pointer",
                    background: "linear-gradient(45deg, #f43f5e, #22d3ee, #10b981)",
                    boxShadow: !selectedMask.colorOverride ? "0 0 8px #22d3ee" : "none",
                  }}
                />
                {["#22d3ee", "#f43f5e", "#10b981", "#fbbf24", "#a855f7", "#ffffff"].map((color) => (
                  <button
                    key={color}
                    className={`color-swatch ${selectedMask.colorOverride === color ? "active" : ""}`}
                    onClick={() => onUpdateMask(selectedMask.id, { colorOverride: color })}
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      border: selectedMask.colorOverride === color ? "2px solid #ffffff" : "2px solid rgba(255,255,255,0.2)",
                      backgroundColor: color,
                      cursor: "pointer",
                      boxShadow: selectedMask.colorOverride === color ? `0 0 8px ${color}` : "none",
                      transition: "transform 0.15s ease",
                    }}
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
              Reset parameters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
