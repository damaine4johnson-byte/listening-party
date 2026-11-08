import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as crypto from "node:crypto";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const roomId = "12345678-1234-1234-1234-123456789abc";
const destination = `/?roomId=${roomId}&resume=1#enter-room`;

function load(file, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    require(name) {
      if (name.endsWith(".css")) return { default: {} };
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    ...globals,
  }, { filename: file });
  return loadedModule.exports;
}

const roomReturn = load("lib/listener-room-return.ts");

function createRoute(host) {
  const response = {
    json(body, options) {
      return { body, status: options?.status ?? 200, cookies: { set() {} } };
    },
  };
  return load("app/api/auth/resolve/route.ts", {
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { email: "listener@example.test", email_confirmed_at: "yes" } }, error: null }) } }) },
    "next/server": { NextResponse: response },
    "../../../../lib/supabase-admin": { createSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: host, error: null }) }) }) }) }) },
    "../../../../lib/host-session": { HOST_SESSION_COOKIE: "host", HOST_SESSION_MAX_AGE: 60, createHostSessionToken: () => "host-token", hostProfileId: () => "host-id" },
    "../../../../lib/listener-room-return": roomReturn,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" } } });
}

function request(body) {
  return {
    headers: { get: (name) => name === "origin" ? "https://example.test" : null },
    nextUrl: { origin: "https://example.test" },
    json: async () => body,
  };
}

test("room destinations accept only UUIDs and never arbitrary URLs", () => {
  assert.equal(roomReturn.listenerRoomDestination(roomId), destination);
  for (const invalid of ["//evil.test", "/profile", `${roomId}&next=https://evil.test`, "", null, 123]) {
    assert.equal(roomReturn.listenerRoomDestination(invalid), null);
  }
});

test("listener resolution returns the room and retains existing destinations otherwise", async () => {
  const route = createRoute(null);
  const room = await route.POST(request({ accessToken: "test", roomId }));
  assert.equal(room.body.destination, destination);
  const invalid = await route.POST(request({ accessToken: "test", roomId: "//evil.test", next: "/wallet" }));
  assert.equal(invalid.body.destination, "/wallet");
  const ordinary = await route.POST(request({ accessToken: "test", next: "/profile" }));
  assert.equal(ordinary.body.destination, "/profile");
});

test("host routing remains unchanged even with a room return requested", async () => {
  const route = createRoute({ account_status: "active" });
  const profile = await route.POST(request({ accessToken: "test", roomId, next: "/profile" }));
  const host = await route.POST(request({ accessToken: "test", roomId, next: "/host" }));
  assert.equal(profile.body.destination, "/profile");
  assert.equal(host.body.destination, "/host");
});

test("room join identifies the correct artist only after checking listener and room", async () => {
  let signedIn = true;
  let fee = 0;
  const hostId = "a".repeat(64);
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: { id: roomId, status: "live", host_id: hostId, entry_fee_cents: fee }, error: null }; },
  };
  const follows = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  const route = load("app/api/rooms/join/route.ts", {
    "node:crypto": crypto,
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "../../../../lib/room-session": {},
    "../../../../lib/supabase-admin": { createSupabaseAdmin: () => ({ from: (table) => table === "rooms" ? query : follows }) },
    "../../../../lib/host-session": {},
    "../../../../lib/host-profile": {},
    "../../../../lib/listener-auth": { getListenerUser: async () => signedIn ? { id: "listener" } : null },
    "../../../../lib/invite-code": {},
    "../../../../lib/artists-public": { handleOf: (id) => id.slice(0, 16) },
    "../../../../lib/artist-username": { usernameForHost: async () => "artist" },
  }, { process: { env: {} }, console });
  const input = { json: async () => ({ roomId, displayName: "Listener" }) };
  const result = await route.POST(input);
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "follow_required");
  assert.equal(result.body.artistHandle, "artist");
  signedIn = false;
  const unauthorized = await route.POST(input);
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.artistHandle, undefined);
  signedIn = true;
  fee = 100;
  const paid = await route.POST(input);
  assert.equal(paid.status, 403);
  assert.equal(paid.body.code, undefined);
});

function component(file, deps, globals) {
  let effect;
  const states = [];
  let index = 0;
  const react = {
    useState(initial) {
      const current = index++;
      if (!(current in states)) states[current] = initial;
      return [states[current], (value) => { states[current] = value; }];
    },
    useEffect(callback) { effect = callback; },
  };
  const jsx = (type, props) => ({ type, props });
  const loaded = load(file, { react, "react/jsx-runtime": { jsx, jsxs: jsx }, ...deps }, globals);
  return {
    render() { index = 0; return loaded.default(); },
    effect() { return effect(); },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
}

test("Google sign-in preserves a valid room ID without accepting invalid IDs", async () => {
  let redirectTo;
  const window = { location: { origin: "https://example.test", search: `?roomId=${roomId}`, replace() {} } };
  const client = component("app/signin/listener-signin-form.tsx", {
    "../../lib/supabase": { supabase: { auth: {
      signInWithOAuth: async (options) => { redirectTo = options.options.redirectTo; return { error: null }; },
    } } },
    "../../lib/listener-room-return": roomReturn,
  }, { window, URLSearchParams });
  const clickGoogle = () => find(client.render(), (node) => node.type === "button" && node.props.onClick).props.onClick();
  await clickGoogle();
  assert.equal(redirectTo, `https://example.test/auth/callback?next=%2Fprofile&roomId=${roomId}`);
  window.location.search = "?roomId=invalid";
  await clickGoogle();
  assert.equal(redirectTo, "https://example.test/auth/callback?next=%2Fprofile");
});

test("password sign-in resolves the account and returns listeners to the room", async () => {
  let redirect;
  const calls = [];
  const window = { location: { origin: "https://example.test", search: `?roomId=${roomId}`, replace: (value) => { redirect = value; } } };
  const client = component("app/signin/listener-signin-form.tsx", {
    "../../lib/supabase": { supabase: { auth: {
      setSession: async () => ({ error: null }),
      getSession: async () => ({ data: { session: { access_token: "test" } } }),
    } } },
    "../../lib/listener-room-return": roomReturn,
  }, {
    window, URLSearchParams,
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return url === "/api/listeners/login"
        ? { ok: true, json: async () => ({ access_token: "test", refresh_token: "refresh" }) }
        : { ok: true, json: async () => ({ accountType: "listener", destination }) };
    },
  });
  let tree = client.render();
  find(tree, (node) => node.props?.id === "li-user").props.onChange({ target: { value: "listener" } });
  find(tree, (node) => node.props?.id === "li-pass").props.onChange({ target: { value: "password" } });
  tree = client.render();
  find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await settle();
  assert.equal(calls[1].body.roomId, roomId);
  assert.equal(redirect, destination);
});

test("OAuth callback returns the listener to the room, but never trusts arbitrary destinations", async () => {
  let redirect;
  let responseDestination = destination;
  const window = { location: { search: `?next=%2Fprofile&roomId=${roomId}`, replace: (value) => { redirect = value; } } };
  const client = component("app/auth/callback/page.tsx", {
    "../../../lib/oauth-callback": { getOAuthAccessToken: async () => ({ accessToken: "test", error: null }) },
    "../../../lib/supabase": { oauthCallbackUrl: null, supabase: {} },
    "../../../lib/listener-room-return": roomReturn,
  }, {
    window, URLSearchParams,
    fetch: async (_url, options) => {
      assert.equal(JSON.parse(options.body).roomId, roomId);
      return { ok: true, json: async () => ({ accountType: "listener", destination: responseDestination }) };
    },
  });
  client.render();
  client.effect();
  await settle();
  assert.equal(redirect, destination);
  responseDestination = "https://evil.test";
  client.effect();
  await settle();
  assert.equal(redirect, "/profile");
});
