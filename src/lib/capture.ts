export type SaveMode = "camera" | "dark" | "transparent";

/** Compose and download the artwork as a PNG. */
export function savePng(
  drawingCanvas: HTMLCanvasElement,
  video: HTMLVideoElement | null,
  mode: SaveMode,
) {
  const w = drawingCanvas.width;
  const h = drawingCanvas.height;
  if (w === 0 || h === 0) return;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;

  if (mode === "camera" && video && video.videoWidth > 0) {
    // Mirror the frame the same way it is shown on screen (selfie view),
    // cropped with object-fit: cover.
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, ox, oy, dw, dh);
    ctx.restore();
    // Slight dim so strokes pop, matching the on-screen look.
    ctx.fillStyle = "rgba(6, 8, 15, 0.25)";
    ctx.fillRect(0, 0, w, h);
  } else if (mode === "dark" || (mode === "camera" && !video)) {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#0b0e1a");
    bg.addColorStop(1, "#101423");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  // mode === "transparent": leave the backdrop empty for compositing
  // the artwork over anything (stickers, overlays, other apps).

  ctx.drawImage(drawingCanvas, 0, 0);

  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19);
    a.href = url;
    a.download = `draw-on-hand-${stamp}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
