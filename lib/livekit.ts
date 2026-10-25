import "server-only";
import { createHmac } from "node:crypto";

export function livekitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function isLivekitConfigured() {
  return livekitConfig() !== null;
}

function base64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// LiveKit access tokens are plain HS256 JWTs, so no server SDK is needed.
export function createLivekitToken(options: { roomName: string; identity: string; name: string; canPublish: boolean }) {
  const config = livekitConfig();
  if (!config) throw new Error("LiveKit is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    iss: config.apiKey,
    sub: options.identity,
    name: options.name,
    nbf: now - 10,
    exp: now + 60 * 60 * 4,
    video: {
      room: options.roomName,
      roomJoin: true,
      canSubscribe: true,
      canPublish: options.canPublish,
      canPublishData: false,
    },
  });
  const signature = createHmac("sha256", config.apiSecret).update(`${header}.${payload}`).digest("base64url");
  return { token: `${header}.${payload}.${signature}`, url: config.url };
}
