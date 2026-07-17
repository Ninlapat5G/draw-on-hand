import type { AppStatus } from "../types";
import { AlertIcon } from "./icons";

interface StatusOverlaysProps {
  status: AppStatus;
}

/** Full-screen loading and error cards for the tracking pipeline. */
export function StatusOverlays({ status }: StatusOverlaysProps) {
  if (status === "loading-model" || status === "starting-camera") {
    return (
      <div className="overlay-center">
        <div className="overlay-card glass">
          <div className="spinner" />
          <h2>
            {status === "loading-model"
              ? "กำลังโหลดระบบติดตามมือ…"
              : "กำลังเปิดกล้อง…"}
          </h2>
          <p>
            ทุกอย่างประมวลผลในเบราว์เซอร์ของคุณเท่านั้น —
            ไม่มีการส่งภาพวิดีโอออกนอกอุปกรณ์
          </p>
        </div>
      </div>
    );
  }

  if (status === "camera-denied" || status === "error") {
    return (
      <div className="overlay-center">
        <div className="overlay-card glass">
          <div className="overlay-icon">
            <AlertIcon />
          </div>
          <h2>
            {status === "camera-denied"
              ? "ต้องอนุญาตให้เข้าถึงกล้อง"
              : "เกิดข้อผิดพลาด"}
          </h2>
          <p>
            {status === "camera-denied"
              ? "Draw on Hand ใช้มือของคุณในการวาด จึงต้องใช้กล้อง กดอนุญาตการเข้าถึงกล้องที่แถบที่อยู่ของเบราว์เซอร์ แล้วลองอีกครั้ง"
              : "ไม่สามารถเริ่มระบบติดตามมือได้ ตรวจสอบอินเทอร์เน็ตและการรองรับ GPU ของเครื่อง แล้วลองอีกครั้ง"}
          </p>
          <button className="retry-btn" onClick={() => location.reload()}>
            ลองอีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  return null;
}
