import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export async function createHandLandmarker(): Promise<HandLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/**
 * Dev/demo camera: an animated canvas stream so the full tracking pipeline
 * (and its real inference cost) runs on machines without a camera.
 * Enabled with `?mock=1` in the URL.
 */
function createMockCameraStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  const draw = () => {
    const t = performance.now() / 1000;
    ctx.fillStyle = "#141a28";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Moving blobs keep every frame unique so detectForVideo runs each tick.
    for (let i = 0; i < 3; i++) {
      const x = (Math.sin(t * (0.7 + i * 0.3) + i * 2) * 0.5 + 0.5) * 1100 + 90;
      const y = (Math.cos(t * (0.5 + i * 0.2) + i) * 0.5 + 0.5) * 560 + 80;
      ctx.fillStyle = `hsl(${220 + i * 30} 30% ${22 + i * 6}%)`;
      ctx.beginPath();
      ctx.arc(x, y, 90 + i * 40, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  };
  draw();
  return canvas.captureStream(30);
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = new URLSearchParams(location.search).has("mock")
    ? createMockCameraStream()
    : await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
  video.srcObject = stream;
  await video.play();
  return stream;
}

/**
 * Maps a landmark position (normalized to the video frame) onto a canvas that
 * displays the video with `object-fit: cover`, including the selfie mirror.
 * Returns CSS-pixel coordinates on the canvas.
 */
export function videoPointToCanvas(
  nx: number,
  ny: number,
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  const scale = Math.max(canvasW / videoW, canvasH / videoH);
  const dw = videoW * scale;
  const dh = videoH * scale;
  const ox = (canvasW - dw) / 2;
  const oy = (canvasH - dh) / 2;
  return {
    x: ox + (1 - nx) * dw,
    y: oy + ny * dh,
  };
}

export type { NormalizedLandmark };
