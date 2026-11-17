import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "app/room/camera-settings.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(code, { module: loaded, exports: loaded.exports, Math, Number, Object, Array });
const {
  DEFAULT_CAMERA_SETTINGS, sanitizeCameraSettings, buildCanvasFilter, isNeutralLook, captureResolution,
  maxBitrateBps, matchingPreset, captureNeedsRestart, CAMERA_PRESETS,
} = loaded.exports;

const base = (patch = {}) => ({ ...DEFAULT_CAMERA_SETTINGS, ...patch });
const plain = (value) => ({ ...value });

test("garbage input falls back to defaults", () => {
  assert.deepEqual(plain(sanitizeCameraSettings(null)), plain(DEFAULT_CAMERA_SETTINGS));
  assert.deepEqual(plain(sanitizeCameraSettings("nope")), plain(DEFAULT_CAMERA_SETTINGS));
  assert.deepEqual(
    plain(sanitizeCameraSettings({ resolution: "4k", frameRate: 144, filter: "hacker", brightness: "x" })),
    plain(DEFAULT_CAMERA_SETTINGS),
  );
});

test("saved values are clamped and bitrate snaps to the slider step", () => {
  const result = sanitizeCameraSettings({ brightness: 900, contrast: -900, saturation: 55.6, bitrateKbps: 99999 });
  assert.equal(result.brightness, 50);
  assert.equal(result.contrast, -50);
  assert.equal(result.saturation, 56);
  assert.equal(result.bitrateKbps, 5000);
  assert.equal(sanitizeCameraSettings({ bitrateKbps: 1620 }).bitrateKbps, 1500);
  assert.equal(sanitizeCameraSettings({ bitrateKbps: 10 }).bitrateKbps, 500);
});

test("a neutral look needs no processing and no filter string", () => {
  assert.equal(isNeutralLook(base()), true);
  assert.equal(buildCanvasFilter(base()), "none");
  assert.equal(isNeutralLook(base({ brightness: 1 })), false);
  assert.equal(isNeutralLook(base({ filter: "noir" })), false);
});

test("filter string combines the preset with the adjustments", () => {
  const css = buildCanvasFilter(base({ filter: "noir", brightness: 20, contrast: -10, saturation: -100 }));
  assert.ok(css.startsWith("grayscale(1)"));
  assert.ok(css.includes("brightness(1.20)"));
  assert.ok(css.includes("contrast(0.90)"));
  assert.ok(css.includes("saturate(0.00)"));
  assert.equal(buildCanvasFilter(base({ brightness: 10 })), "brightness(1.10)");
});

test("capture size and bitrate follow the settings", () => {
  assert.deepEqual(plain(captureResolution(base({ resolution: "1080p", frameRate: 60 }))), { width: 1920, height: 1080, frameRate: 60 });
  assert.deepEqual(plain(captureResolution(base())), { width: 1280, height: 720, frameRate: 30 });
  assert.equal(maxBitrateBps(base({ bitrateKbps: 2500 })), 2500000);
});

test("presets are recognised only while their quality values all match", () => {
  assert.equal(matchingPreset(base()), "balanced");
  assert.equal(matchingPreset(base({ ...CAMERA_PRESETS.sharp.quality })), "sharp");
  assert.equal(matchingPreset(base({ bitrateKbps: 2000 })), null);
});

test("a restart is only requested when the camera is clearly off target", () => {
  const wanted = base({ resolution: "720p", frameRate: 30 });
  assert.equal(captureNeedsRestart({ height: 720, frameRate: 30 }, wanted), false);
  assert.equal(captureNeedsRestart({ height: 720, frameRate: 29.97 }, wanted), false);
  assert.equal(captureNeedsRestart({ height: 480, frameRate: 30 }, wanted), true);
  assert.equal(captureNeedsRestart({ height: 720, frameRate: 15 }, wanted), true);
  assert.equal(captureNeedsRestart({}, wanted), false);
  assert.equal(captureNeedsRestart({ height: 720, frameRate: 30 }, base({ resolution: "1080p" })), true);
});
