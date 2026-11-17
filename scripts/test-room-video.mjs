import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "app/room/use-room-video.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function createHook() {
  const slots = [];
  let cursor = 0;
  const effects = [];
  const events = {};
  const appended = [];
  const audioBox = { querySelectorAll: () => appended, appendChild: (element) => appended.push(element) };
  const videoElement = {};
  const react = {
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useEffect(callback) { effects.push(callback); },
    useCallback(callback) { return callback; },
  };
  const Track = { Kind: { Audio: "audio", Video: "video" }, Source: { Microphone: "microphone", ScreenShare: "screen" } };
  const RoomEvent = Object.fromEntries([
    "TrackSubscribed", "TrackUnsubscribed", "TrackSubscriptionFailed", "LocalTrackPublished", "LocalTrackUnpublished",
    "TrackMuted", "TrackUnmuted", "LocalAudioSilenceDetected", "AudioPlaybackStatusChanged",
    "Reconnecting", "Reconnected", "Disconnected",
  ].map((event) => [event, event]));
  let room;
  class Room {
    constructor() {
      room = this;
      this.canPlaybackAudio = true;
      this.remoteParticipants = new Map();
      this.localParticipant = { trackPublications: new Map() };
    }
    on(name, callback) { events[name] = callback; return this; }
    async connect() {}
    async disconnect() {}
    async startAudio() { this.canPlaybackAudio = true; events.AudioPlaybackStatusChanged(); }
  }
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Promise, Error,
    require(name) {
      if (name === "react") return react;
      if (name === "livekit-client") return { Track, RoomEvent, Room };
      if (name === "./broadcast-controls") return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: async () => ({ ok: true, json: async () => ({ configured: true }) }),
  });
  const render = (muted = false) => {
    cursor = 0;
    return module.exports.useRoomVideo(muted, 0.8);
  };
  return {
    async start() {
      const hook = render();
      hook.audioBoxRef.current = audioBox;
      hook.videoRef.current = videoElement;
      effects.splice(0).forEach((effect) => effect());
      for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
    },
    render, events, appended, videoElement,
    get room() { return room; },
  };
}

test("a newly subscribed microphone uses the current mute state", async () => {
  const hook = createHook();
  await hook.start();
  hook.render(true);
  const element = { muted: false };
  const volumes = [];
  hook.events.TrackSubscribed(
    { kind: "audio", attach: () => element },
    { source: "microphone" },
    { setVolume: (volume) => volumes.push(volume) },
  );
  assert.equal(element.muted, true);
  assert.deepEqual(volumes, [0]);
});

test("blocked live audio can be retried from a listener gesture", async () => {
  const hook = createHook();
  await hook.start();
  hook.room.canPlaybackAudio = false;
  hook.events.AudioPlaybackStatusChanged();
  assert.equal(hook.render().audioBlocked, true);
  await hook.render().retryAudio();
  assert.equal(hook.render().audioBlocked, false);
  assert.equal(hook.render().audioError, "");
});

test("failed audio recovery remains blocked and offers a retry", async () => {
  const hook = createHook();
  await hook.start();
  hook.room.canPlaybackAudio = false;
  hook.room.startAudio = async () => { throw new Error("Playback blocked"); };
  hook.events.AudioPlaybackStatusChanged();
  await hook.render().retryAudio();
  assert.equal(hook.render().audioBlocked, true);
  assert.match(hook.render().audioError, /try again/);
});

test("connection interruptions and microphone silence are visible", async () => {
  const hook = createHook();
  await hook.start();
  hook.events.Reconnecting();
  assert.match(hook.render().connectionNotice, /Reconnecting/);
  hook.events.Reconnected();
  assert.equal(hook.render().connectionNotice, "");
  hook.events.TrackSubscriptionFailed();
  assert.match(hook.render().connectionNotice, /Reload/);
  hook.events.LocalAudioSilenceDetected({ source: "microphone" });
  assert.match(hook.render().error, /No sound detected/);
  hook.events.Disconnected();
  assert.match(hook.render().connectionNotice, /Reload/);
});

test("unsubscribing a video track never removes the shared video element", async () => {
  const hook = createHook();
  await hook.start();
  let removed = false;
  hook.events.TrackUnsubscribed({
    kind: "video",
    detach: () => [{ remove: () => { removed = true; } }],
  });
  assert.equal(removed, false);
});
