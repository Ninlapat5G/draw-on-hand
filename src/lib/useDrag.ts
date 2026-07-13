import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Mouse/touch dragging for floating panels. Returns a pointerdown handler to
 * put on the drag handle plus `wasDragged()` so click handlers on the same
 * element can ignore the click that follows a drag.
 */
export function usePointerDrag(onMove: (dx: number, dy: number) => void) {
  const dragged = useRef(false);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    dragged.current = false;
    let lastX = e.clientX;
    let lastY = e.clientY;
    let total = 0;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      total += Math.hypot(dx, dy);
      if (total > 6) dragged.current = true;
      onMoveRef.current(dx, dy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  const wasDragged = useCallback(() => dragged.current, []);

  return { onPointerDown, wasDragged };
}
