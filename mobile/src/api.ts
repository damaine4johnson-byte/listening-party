export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export type ApiOptions = {
  method?: string;
  body?: unknown;
  accessToken?: string | null;
  hostToken?: string | null;
  roomToken?: string | null;
  mobile?: boolean;
};

export async function api(path: string, options: ApiOptions = {}) {
  if (!API_URL) throw new Error("Set EXPO_PUBLIC_API_URL to your listening-rooms website URL.");
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: API_URL,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.hostToken) headers["x-fi-host-session"] = options.hostToken;
  if (options.roomToken) headers["x-fi-room-session"] = options.roomToken;
  if (options.mobile) headers["x-fi-mobile"] = "1";

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!data) throw new Error("The server returned an invalid response.");
  return { response, data };
}

export function responseError(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === "string" ? data.error : fallback;
}
