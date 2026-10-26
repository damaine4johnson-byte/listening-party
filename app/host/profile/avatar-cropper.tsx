"use client";

import { useEffect, useRef, useState } from "react";

export function AvatarCropper({ file, onCancel, onDone, aspect = 1, round = true, title = "Crop picture" }: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
  aspect?: number;
  round?: boolean;
  title?: string;
}) {
  const BW = 280;
  const BH = Math.round(BW / aspect);
  const OUT_W = aspect === 1 ? 512 : 1280;
  const OUT_H = Math.round(OUT_W / aspect);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let active = true;
    createImageBitmap(file).then((b) => active && setBitmap(b)).catch(() => active && setError("Could not read that image."));
    return () => { active = false; };
  }, [file]);

  // Returns the top-left and size of the image inside a box of `size`, clamped so it always covers the box.
  function layout(width: number, ox = offset.x, oy = offset.y) {
    if (!bitmap) return { x: 0, y: 0, w: 0, h: 0 };
    const k = width / BW;
    const height = BH * k;
    const scale = Math.max(BW / bitmap.width, BH / bitmap.height) * zoom * k;
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    const x = Math.min(0, Math.max(width - w, (width - w) / 2 + ox * k));
    const y = Math.min(0, Math.max(height - h, (height - h) / 2 + oy * k));
    return { x, y, w, h };
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !bitmap) return;
    const { x, y, w, h } = layout(BW);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, BW, BH);
    ctx.drawImage(bitmap, x, y, w, h);
  });

  function apply() {
    if (!bitmap) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y, w, h } = layout(OUT_W);
    ctx.drawImage(bitmap, x, y, w, h);
    canvas.toBlob((blob) => (blob ? onDone(blob) : setError("Could not process that image.")), "image/jpeg", 0.85);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.75)",
      display: "grid", placeItems: "center", padding: 16,
    }}>
      <div className="panel" style={{ width: "min(340px, 100%)", textAlign: "center" }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p className="small">Drag to reposition, use the slider to zoom.</p>
        <div style={{ position: "relative", width: BW, height: BH, margin: "0 auto" }}>
          <canvas
            ref={canvasRef}
            width={BW}
            height={BH}
            style={{ width: BW, height: BH, touchAction: "none", cursor: "grab", borderRadius: 8 }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current || !bitmap) return;
              const nx = drag.current.ox + e.clientX - drag.current.x;
              const ny = drag.current.oy + e.clientY - drag.current.y;
              const { x, y } = layout(BW, nx, ny);
              const { w, h } = layout(BW);
              // Store the clamped offset so dragging past the edge doesn't build up hidden slack.
              setOffset({ x: x - (BW - w) / 2, y: y - (BH - h) / 2 });
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          />
          <div aria-hidden style={{
            position: "absolute", inset: 0, borderRadius: round ? "50%" : 8, pointerEvents: "none",
            boxShadow: "0 0 0 999px rgba(0,0,0,.55)", border: "2px solid #fff",
          }} />
        </div>
        <input
          type="range"
          aria-label="Zoom"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ width: BW, marginTop: 14 }}
        />
        {error && <p className="small" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
          <button className="btn secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn" type="button" onClick={apply} disabled={!bitmap}>Use photo</button>
        </div>
      </div>
    </div>
  );
}
