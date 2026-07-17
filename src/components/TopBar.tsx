import type { AppStatus } from "../types";
import { SparkleIcon } from "./icons";

interface TopBarProps {
  status: AppStatus;
  handPresent: boolean;
}

function statusText(status: AppStatus, handPresent: boolean): string {
  switch (status) {
    case "loading-model":
      return "กำลังโหลดระบบติดตามมือ…";
    case "starting-camera":
      return "กำลังเปิดกล้อง…";
    case "camera-denied":
      return "กล้องถูกปิดกั้น";
    case "error":
      return "ระบบติดตามใช้งานไม่ได้";
    case "ready":
      return handPresent ? "ตรวจพบมือแล้ว" : "ยกมือให้กล้องเห็น";
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
          <span className="brand-name">Draw on Hand</span>
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
