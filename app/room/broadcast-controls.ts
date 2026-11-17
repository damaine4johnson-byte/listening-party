import type { LocalParticipant } from "livekit-client";

export type BroadcastSources = {
  camera: boolean;
  microphone: boolean;
  screen: boolean;
};

export function getBroadcastSources(participant: LocalParticipant): BroadcastSources {
  return {
    camera: participant.isCameraEnabled,
    microphone: participant.isMicrophoneEnabled,
    screen: participant.isScreenShareEnabled,
  };
}

async function runChanges(changes: { name: string; run: () => Promise<unknown> }[]) {
  const results = await Promise.allSettled(changes.map(({ run }) => Promise.resolve().then(run)));
  const failed = changes.filter((_, index) => results[index].status === "rejected");
  if (failed.length) throw new Error(failed.map(({ name }) => name).join(", "));
}

export async function pauseBroadcast(participant: LocalParticipant) {
  await runChanges([
    { name: "camera", run: () => participant.setCameraEnabled(false) },
    { name: "microphone", run: () => participant.setMicrophoneEnabled(false) },
    { name: "screen share", run: () => participant.setScreenShareEnabled(false) },
  ]);
}

export async function resumeBroadcast(participant: LocalParticipant, sources: BroadcastSources) {
  const changes = [];
  if (sources.camera) changes.push({ name: "camera", run: () => participant.setCameraEnabled(true) });
  if (sources.microphone) changes.push({ name: "microphone", run: () => participant.setMicrophoneEnabled(true) });
  await runChanges(changes);
}
