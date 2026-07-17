import { CloseIcon } from "./icons";

export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
  /** optional action button (e.g. restore after clearing the canvas) */
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastsProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

/**
 * Non-blocking notification stack, replacing browser alert() so feedback
 * matches the app's look and stays pinch-clickable like every other control.
 */
export function Toasts({ toasts, onDismiss }: ToastsProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span className="toast-text">{toast.text}</span>
          {toast.actionLabel && (
            <button
              className="toast-action"
              onClick={() => {
                toast.onAction?.();
                onDismiss(toast.id);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="ปิดการแจ้งเตือน"
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
