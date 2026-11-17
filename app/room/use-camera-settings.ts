"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalVideoTrack } from "livekit-client";
import {
  DEFAULT_CAMERA_SETTINGS, CAMERA_PRESETS, captureNeedsRestart, captureResolution, isNeutralLook,
  maxBitrateBps, sanitizeCameraSettings,
} from "./camera-settings";
import type { CameraPresetId, CameraSettings } from "./camera-settings";
import { CameraFilterProcessor, supportsCanvasFilters } from "./camera-filter-processor";

const STORAGE_KEY = "room-camera-settings";

export function useCameraSettings() {
  const [settings, setSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const settingsRef = useRef(settings);
  const loadedRef = useRef(false);
  settingsRef.current = settings;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setSettings(sanitizeCameraSettings(JSON.parse(saved)));
    } catch {
      // A missing or corrupt saved profile just falls back to the defaults.
    }
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings still work for this session when storage is unavailable.
    }
  }, [settings]);

  const update = useCallback((patch: Partial<CameraSettings>) => {
    setSettings((current) => sanitizeCameraSettings({ ...current, ...patch }));
  }, []);
  const applyPreset = useCallback((id: CameraPresetId) => update(CAMERA_PRESETS[id].quality), [update]);
  const resetLook = useCallback(() => update({ filter: "none", brightness: 0, contrast: 0, saturation: 0 }), [update]);

  return { settings, settingsRef, update, applyPreset, resetLook };
}

// Caps only the full-resolution encoding so lower simulcast layers keep their own limits.
async function applyMaxBitrate(track: LocalVideoTrack, bitrate: number) {
  const sender = track.sender;
  if (!sender) return;
  const parameters = sender.getParameters();
  const encodings = parameters.encodings?.filter((encoding) => (encoding.scaleResolutionDownBy ?? 1) === 1);
  if (!encodings?.length) return;
  encodings.forEach((encoding) => { encoding.maxBitrate = bitrate; });
  await sender.setParameters(parameters);
}

// Applies settings to the live camera track. Look and bitrate changes are applied in place;
// only resolution and frame rate restart the capture, debounced so dragging stays smooth.
export function useCameraPipeline(getTrack: () => LocalVideoTrack | null, cameraOn: boolean, settings: CameraSettings) {
  const processorRef = useRef<{ track: LocalVideoTrack; processor: CameraFilterProcessor } | null>(null);
  const captureRef = useRef<{ track: LocalVideoTrack | null; key: string }>({ track: null, key: "" });
  const settingsRef = useRef(settings);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState("");
  const [filtersSupported, setFiltersSupported] = useState(true);
  settingsRef.current = settings;

  useEffect(() => setFiltersSupported(supportsCanvasFilters()), []);

  const { filter, brightness, contrast, saturation, bitrateKbps, resolution, frameRate } = settings;

  useEffect(() => {
    if (!cameraOn) {
      processorRef.current = null;
      captureRef.current = { track: null, key: "" };
      return;
    }
    const track = getTrack();
    if (!track) return;
    if (processorRef.current && processorRef.current.track !== track) processorRef.current = null;

    const current = settingsRef.current;
    if (processorRef.current) {
      processorRef.current.processor.update(current);
    } else if (!isNeutralLook(current)) {
      if (!supportsCanvasFilters()) {
        setNotice("This browser cannot apply filters to the live camera. Try Chrome, Edge or Firefox.");
        return;
      }
      // Attached lazily and kept for the life of the track so the picture never swaps mid-stream.
      const processor = new CameraFilterProcessor(current);
      processorRef.current = { track, processor };
      setNotice("");
      track.setProcessor(processor).catch(() => {
        if (processorRef.current?.processor === processor) processorRef.current = null;
        setNotice("Filters could not start. The camera is still live without them.");
      });
    }
  }, [cameraOn, getTrack, filter, brightness, contrast, saturation]);

  useEffect(() => {
    if (!cameraOn) return;
    const timer = window.setTimeout(() => {
      const track = getTrack();
      if (!track) return;
      applyMaxBitrate(track, maxBitrateBps(settingsRef.current)).catch(() => {
        setNotice("Bitrate will apply the next time the camera starts.");
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [cameraOn, getTrack, bitrateKbps]);

  useEffect(() => {
    if (!cameraOn) return;
    const key = `${resolution}/${frameRate}`;
    const timer = window.setTimeout(async () => {
      const track = getTrack();
      if (!track) return;
      const previous = captureRef.current;
      const sameTrack = previous.track === track;
      if (sameTrack && previous.key === key) return;
      captureRef.current = { track, key };
      const wanted = settingsRef.current;
      if (!sameTrack && !captureNeedsRestart(track.mediaStreamTrack.getSettings(), wanted)) return;
      setApplying(true);
      try {
        await track.restartTrack({ resolution: captureResolution(wanted) });
        setNotice("");
      } catch {
        setNotice("Could not change camera quality. Your camera is still live with the previous settings.");
      } finally {
        setApplying(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [cameraOn, getTrack, resolution, frameRate]);

  return { applying, notice, filtersSupported };
}
