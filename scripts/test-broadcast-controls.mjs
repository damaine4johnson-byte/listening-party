import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "app/room/broadcast-controls.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(code, { module: loaded, exports: loaded.exports, Promise, Error });
const { getBroadcastSources, pauseBroadcast, resumeBroadcast } = loaded.exports;

function participant({ camera = false, microphone = false, screen = false, fail = "" } = {}) {
  const calls = [];
  const change = (name) => async (enabled) => {
    calls.push([name, enabled]);
    if (fail === name) throw new Error("Device failure");
  };
  return {
    isCameraEnabled: camera,
    isMicrophoneEnabled: microphone,
    isScreenShareEnabled: screen,
    setCameraEnabled: change("camera"),
    setMicrophoneEnabled: change("microphone"),
    setScreenShareEnabled: change("screen"),
    calls,
  };
}

test("pause stops every broadcast source without touching song playback", async () => {
  const host = participant({ camera: true, microphone: true, screen: true });
  const sources = getBroadcastSources(host);
  assert.equal(sources.camera, true);
  assert.equal(sources.microphone, true);
  assert.equal(sources.screen, true);
  await pauseBroadcast(host);
  assert.deepEqual(host.calls, [["camera", false], ["microphone", false], ["screen", false]]);
});

test("resume restores only previously enabled camera and microphone, never screen share", async () => {
  for (const camera of [false, true]) {
    for (const microphone of [false, true]) {
      const host = participant();
      await resumeBroadcast(host, { camera, microphone, screen: true });
      assert.deepEqual(host.calls, [
        ...(camera ? [["camera", true]] : []),
        ...(microphone ? [["microphone", true]] : []),
      ]);
    }
  }
});

test("pause attempts every source and reports failures instead of claiming success", async () => {
  const host = participant({ fail: "microphone" });
  await assert.rejects(pauseBroadcast(host), /microphone/);
  assert.deepEqual(host.calls, [["camera", false], ["microphone", false], ["screen", false]]);
});

test("resume reports failed sources while still attempting the others", async () => {
  const host = participant({ fail: "camera" });
  await assert.rejects(resumeBroadcast(host, { camera: true, microphone: true, screen: false }), /camera/);
  assert.deepEqual(host.calls, [["camera", true], ["microphone", true]]);
});
