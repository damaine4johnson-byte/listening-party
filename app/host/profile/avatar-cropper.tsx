"use client";

import { useEffect, useRef, useState } from "react";

const BOX = 280;
const OUT = 512;

export function AvatarCropper({ file, onCancel, onDone }: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
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
  function layout(size: number, ox = offset.x, oy = offset.y) {
    if (!bitmap) return { x: 0, y: 0, w: 0, h: 0 };
    const scale = Math.max(BOX / bitmap.width, BOX / bitmap.height) * zoom * (size / BOX);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    const k = size / BOX;
    const x = Math.min(0, Math.max(size - w, (size - w) / 2 + ox * k));
    const y = Math.min(0, Math.max(size - h, (size - h) / 2 + oy * k));
    return { x, y, w, h };
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !bitmap) return;
    const { x, y, w, h } = layout(BOX);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, BOX, BOX);
    ctx.drawImage(bitmap, x, y, w, h);
  });

  function apply() {
    if (!bitmap) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y, w, h } = layout(OUT);
    ctx.drawImage(bitmap, x, y, w, h);
    canvas.toBlob((blob) => (blob ? onDone(blob) : setError("Could not process that image.")), "image/jpeg", 0.85);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop profile picture" style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.75)",
      display: "grid", placeItems: "center", padding: 16,
    }}>
      <div className="panel" style={{ width: "min(340px, 100%)", textAlign: "center" }}>
        <h2 style={{ marginTop: 0 }}>Crop picture</h2>
        <p className="small">Drag to reposition, use the slider to zoom.</p>
        <div style={{ position: "relative", width: BOX, height: BOX, margin: "0 auto" }}>
          <canvas
            ref={canvasRef}
            width={BOX}
            height={BOX}
            style={{ width: BOX, height: BOX, touchAction: "none", cursor: "grab", borderRadius: 8 }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current || !bitmap) return;
              const nx = drag.current.ox + e.clientX - drag.current.x;
              const ny = drag.current.oy + e.clientY - drag.current.y;
              const { x, y } = layout(BOX, nx, ny);
              const { w, h } = layout(BOX);
              // Store the clamped offset so dragging past the edge doesn't build up hidden slack.
              setOffset({ x: x - (BOX - w) / 2, y: y - (BOX - h) / 2 });
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          />
          <div aria-hidden style={{
            position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none",
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
          style={{ width: BOX, marginTop: 14 }}
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
