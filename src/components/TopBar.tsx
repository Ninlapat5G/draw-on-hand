import type { AppStatus } from "../types";
import { SparkleIcon } from "./icons";

interface TopBarProps {
  status: AppStatus;
  handPresent: boolean;
}

function statusText(status: AppStatus, handPresent: boolean): string {
  switch (status) {
    case "loading-model":
      return "Loading hand tracking…";
    case "starting-camera":
      return "Starting camera…";
    case "camera-denied":
      return "Camera blocked";
    case "error":
      return "Tracking unavailable";
    case "ready":
      return handPresent ? "Hand detected" : "Show your hand to the camera";
  }
}

export function TopBar({ status, handPresent }: TopBarProps) {
  const dotClass =
    status === "ready" && handPresent
      ? "status-dot on"
      : status === "ready"
        ? "status-dot warn"
        : "status-dot";

  return (
    <header className="topbar">
      <div className="brand glass">
        <div className="brand-mark">
          <SparkleIcon />
        </div>
        <div className="brand-text">
          <span className="brand-name">AirCanvas</span>
          <span className="brand-sub">Hand-tracking studio</span>
        </div>
      </div>

      <div className="status-pill glass">
        <span className={dotClass} />
        {statusText(status, handPresent)}
      </div>
    </header>
  );
}
