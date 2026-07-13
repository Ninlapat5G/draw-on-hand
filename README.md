# 🎨 Draw on Hand

Draw in the air with your hands — a zero-backend React app powered by
[MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
running entirely in the browser (WASM/GPU). No server, no data leaves your device.

## How to use

- **🤏 Pinch** — touch your thumb and index fingertips together to draw; release to stop. Contact is verified in real 3D space (world landmarks), so a tilted hand can't false-trigger. **Both hands work at once.**
- **Radial dock** — the circular hub at the bottom opens two rings of tools: brush styles (Pen / Neon / Marker / Rainbow / Eraser) on the inner ring, colors and stroke sizes on the outer ring. Pinch the hub to expand/collapse; pinch-hold and move your hand (or mouse-drag) to reposition it.
- **Hand-driven UI** — hover any control with your fingertip and pinch to click. A live skeleton, pinch-progress ring, and status label (HOVER / CLICK / DRAWING / MOVE) show exactly what the tracker sees.
- **Actions panel** (top right, draggable & collapsible) — Undo (`Ctrl+Z`), Clear, hide camera, and **Save** (PNG composited over a camera snapshot, or strokes alone on a dark backdrop).
- **⚙ Pinch settings** — adjust how close your fingertips must get to register a pinch (persisted in `localStorage`).

## Develop

```bash
npm install
npm run dev
```

Open the printed URL and allow camera access. `npm run typecheck` runs TypeScript checks; `npm run build` produces the production bundle in `dist/`.

## Deploy to Vercel

The app is a fully static Vite site — Vercel auto-detects it:

```bash
npm i -g vercel
vercel
```

Or push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new). Framework preset: **Vite** (build `npm run build`, output `dist`). No environment variables or serverless functions needed.

> Note: camera access requires HTTPS, which Vercel provides by default.

## Tech

- React 18 + TypeScript + Vite
- `@mediapipe/tasks-vision` HandLandmarker (VIDEO mode, GPU delegate, 2 hands, model + WASM loaded from Google/jsDelivr CDN)
- Pinch detection = 2D hand-relative distance **AND** 3D world-landmark distance, with hysteresis + multi-frame debounce per hand
- Two-layer `<canvas>` rendering: committed strokes + live strokes/skeleton/cursor overlay
- Strokes stored as normalized points → resolution-independent undo/replay/resize
- Fingertip-driven UI via `elementFromPoint` (hover, click, slider drag, panel drag) — no component changes needed
