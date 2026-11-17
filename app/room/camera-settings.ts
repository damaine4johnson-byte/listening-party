export type CameraResolution = "720p" | "1080p";
export type CameraFrameRate = 24 | 30 | 60;
export type CameraFilterId = "none" | "noir" | "warm" | "cool" | "vintage" | "vivid";

export type CameraSettings = {
  resolution: CameraResolution;
  frameRate: CameraFrameRate;
  bitrateKbps: number;
  filter: CameraFilterId;
  brightness: number;
  contrast: number;
  saturation: number;
};

export type CameraPresetId = "smooth" | "balanced" | "sharp";

export const RESOLUTIONS: readonly CameraResolution[] = ["720p", "1080p"];
export const FRAME_RATES: readonly CameraFrameRate[] = [24, 30, 60];
export const BITRATE_RANGE = { min: 500, max: 5000, step: 250 } as const;
export const ADJUST_RANGE = { brightness: [-50, 50], contrast: [-50, 50], saturation: [-100, 100] } as const;

export const CAMERA_FILTERS: readonly { id: CameraFilterId; label: string; css: string }[] = [
  { id: "none", label: "Natural", css: "" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.12)" },
  { id: "warm", label: "Warm", css: "sepia(0.22) saturate(1.15) hue-rotate(-8deg)" },
  { id: "cool", label: "Cool", css: "saturate(1.08) hue-rotate(14deg) brightness(1.02)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.55) contrast(0.95) brightness(1.05) saturate(0.9)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.4) contrast(1.1)" },
];

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  resolution: "720p",
  frameRate: 30,
  bitrateKbps: 1500,
  filter: "none",
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export const CAMERA_PRESETS: Record<CameraPresetId, { label: string; hint: string; quality: Pick<CameraSettings, "resolution" | "frameRate" | "bitrateKbps"> }> = {
  smooth: { label: "Smooth", hint: "720p · 24 fps · for weak connections", quality: { resolution: "720p", frameRate: 24, bitrateKbps: 1000 } },
  balanced: { label: "Balanced", hint: "720p · 30 fps · the safe default", quality: { resolution: "720p", frameRate: 30, bitrateKbps: 1500 } },
  sharp: { label: "Sharp", hint: "1080p · 30 fps · needs a strong upload", quality: { resolution: "1080p", frameRate: 30, bitrateKbps: 3500 } },
};

const SIZES: Record<CameraResolution, { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function sanitizeCameraSettings(input: unknown): CameraSettings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_CAMERA_SETTINGS;
  const bitrate = Math.round(clamp(toNumber(raw.bitrateKbps, d.bitrateKbps), BITRATE_RANGE.min, BITRATE_RANGE.max) / BITRATE_RANGE.step) * BITRATE_RANGE.step;
  return {
    resolution: RESOLUTIONS.includes(raw.resolution as CameraResolution) ? (raw.resolution as CameraResolution) : d.resolution,
    frameRate: FRAME_RATES.includes(raw.frameRate as CameraFrameRate) ? (raw.frameRate as CameraFrameRate) : d.frameRate,
    bitrateKbps: bitrate,
    filter: CAMERA_FILTERS.some((item) => item.id === raw.filter) ? (raw.filter as CameraFilterId) : d.filter,
    brightness: Math.round(clamp(toNumber(raw.brightness, 0), ...ADJUST_RANGE.brightness)),
    contrast: Math.round(clamp(toNumber(raw.contrast, 0), ...ADJUST_RANGE.contrast)),
    saturation: Math.round(clamp(toNumber(raw.saturation, 0), ...ADJUST_RANGE.saturation)),
  };
}

// True when the picture needs no per-frame processing at all.
export function isNeutralLook(settings: CameraSettings) {
  return settings.filter === "none" && settings.brightness === 0 && settings.contrast === 0 && settings.saturation === 0;
}

// CSS filter string for CanvasRenderingContext2D.filter; "none" when nothing applies.
export function buildCanvasFilter(settings: CameraSettings) {
  if (isNeutralLook(settings)) return "none";
  const parts: string[] = [];
  const preset = CAMERA_FILTERS.find((item) => item.id === settings.filter);
  if (preset?.css) parts.push(preset.css);
  if (settings.brightness !== 0) parts.push(`brightness(${(1 + settings.brightness / 100).toFixed(2)})`);
  if (settings.contrast !== 0) parts.push(`contrast(${(1 + settings.contrast / 100).toFixed(2)})`);
  if (settings.saturation !== 0) parts.push(`saturate(${(1 + settings.saturation / 100).toFixed(2)})`);
  return parts.join(" ");
}

export function captureResolution(settings: CameraSettings) {
  return { ...SIZES[settings.resolution], frameRate: settings.frameRate };
}

export function maxBitrateBps(settings: CameraSettings) {
  return settings.bitrateKbps * 1000;
}

export function matchingPreset(settings: CameraSettings): CameraPresetId | null {
  const found = (Object.entries(CAMERA_PRESETS) as [CameraPresetId, (typeof CAMERA_PRESETS)[CameraPresetId]][]).find(([, preset]) =>
    preset.quality.resolution === settings.resolution
    && preset.quality.frameRate === settings.frameRate
    && preset.quality.bitrateKbps === settings.bitrateKbps);
  return found ? found[0] : null;
}

// Used once per new camera track, for example after a paused broadcast resumes with
// browser-default capture settings. Cameras may deliver less than they were asked for,
// so this is never re-checked in a loop.
export function captureNeedsRestart(actual: { height?: number; frameRate?: number }, settings: CameraSettings) {
  const target = SIZES[settings.resolution];
  const heightOff = typeof actual.height === "number" && Math.abs(actual.height - target.height) / target.height > 0.08;
  const rateOff = typeof actual.frameRate === "number" && Math.abs(actual.frameRate - settings.frameRate) > 3;
  return heightOff || rateOff;
}
