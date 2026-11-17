"use client";

import { useState } from "react";
import { ADJUST_RANGE, BITRATE_RANGE, CAMERA_FILTERS, CAMERA_PRESETS, FRAME_RATES, RESOLUTIONS, matchingPreset } from "./camera-settings";
import type { CameraPresetId, CameraSettings } from "./camera-settings";
import "./camera-settings.css";

type Props = {
  settings: CameraSettings;
  onChange: (patch: Partial<CameraSettings>) => void;
  onPreset: (id: CameraPresetId) => void;
  onResetLook: () => void;
  cameraOn: boolean;
  applying: boolean;
  filtersSupported: boolean;
  notice: string;
};

function Slider({ label, value, min, max, step = 1, format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; format: (value: number) => string; onChange: (value: number) => void;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <label className="cam-slider">
      <span>{label}</span>
      <input
        className="rm-seek"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{format(value)}</output>
    </label>
  );
}

export default function CameraSettingsPanel({ settings, onChange, onPreset, onResetLook, cameraOn, applying, filtersSupported, notice }: Props) {
  const [open, setOpen] = useState(false);
  const preset = matchingPreset(settings);
  const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

  return (
    <div className="cam-settings">
      <button className="btn secondary" type="button" aria-expanded={open} aria-controls="cam-settings-body" onClick={() => setOpen((value) => !value)}>
        🎛 Camera settings {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="cam-body" id="cam-settings-body">
          <p className="small cam-status" role="status">
            {applying ? "Switching camera quality…" : cameraOn ? "Live · look changes apply instantly" : "Camera is off · these settings are used when you start it"}
          </p>

          <div className="cam-group" role="group" aria-label="Quality presets">
            {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((id) => (
              <button key={id} className={`cam-chip ${preset === id ? "on" : ""}`} type="button" aria-pressed={preset === id} title={CAMERA_PRESETS[id].hint} onClick={() => onPreset(id)}>
                {CAMERA_PRESETS[id].label}
              </button>
            ))}
          </div>

          <div className="cam-row">
            <div className="cam-group" role="group" aria-label="Resolution">
              {RESOLUTIONS.map((value) => (
                <button key={value} className={`cam-chip ${settings.resolution === value ? "on" : ""}`} type="button" aria-pressed={settings.resolution === value} onClick={() => onChange({ resolution: value })}>{value}</button>
              ))}
            </div>
            <div className="cam-group" role="group" aria-label="Frame rate">
              {FRAME_RATES.map((value) => (
                <button key={value} className={`cam-chip ${settings.frameRate === value ? "on" : ""}`} type="button" aria-pressed={settings.frameRate === value} onClick={() => onChange({ frameRate: value })}>{value} fps</button>
              ))}
            </div>
          </div>
          <Slider label="Bitrate" value={settings.bitrateKbps} min={BITRATE_RANGE.min} max={BITRATE_RANGE.max} step={BITRATE_RANGE.step} format={(value) => `${(value / 1000).toFixed(2).replace(/0$/, "")} Mbps`} onChange={(bitrateKbps) => onChange({ bitrateKbps })} />
          <p className="small">Resolution and frame rate restart the camera for a moment. Keep them for between songs.</p>

          <div className="cam-divider" />

          {filtersSupported ? (
            <>
              <div className="cam-filters" role="group" aria-label="Filters">
                {CAMERA_FILTERS.map((item) => (
                  <button key={item.id} className={`cam-filter ${settings.filter === item.id ? "on" : ""}`} type="button" aria-pressed={settings.filter === item.id} onClick={() => onChange({ filter: item.id })}>
                    <span className="cam-swatch" style={{ filter: item.css || "none" }} aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
              </div>
              <Slider label="Brightness" value={settings.brightness} min={ADJUST_RANGE.brightness[0]} max={ADJUST_RANGE.brightness[1]} format={signed} onChange={(brightness) => onChange({ brightness })} />
              <Slider label="Contrast" value={settings.contrast} min={ADJUST_RANGE.contrast[0]} max={ADJUST_RANGE.contrast[1]} format={signed} onChange={(contrast) => onChange({ contrast })} />
              <Slider label="Saturation" value={settings.saturation} min={ADJUST_RANGE.saturation[0]} max={ADJUST_RANGE.saturation[1]} format={signed} onChange={(saturation) => onChange({ saturation })} />
              <button className="btn secondary cam-reset" type="button" onClick={onResetLook}>Reset look</button>
            </>
          ) : (
            <p className="small" role="status">Filters need a browser that can process live video (Chrome, Edge or Firefox). Quality settings still work.</p>
          )}
          {notice && <p className="small" role="alert">{notice}</p>}
        </div>
      )}
    </div>
  );
}
