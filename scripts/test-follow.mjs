import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const roomReturnModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(directory, "../lib/listener-room-return.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: roomReturnModule, exports: roomReturnModule.exports });

function loadComponent(file, dependencies, globals) {
  const source = fs.readFileSync(path.join(directory, "..", file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const states = [];
  let cursor = 0;
  let effect;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useEffect(callback) { effect = callback; },
  };
  const jsx = (type, props) => ({ type, props });
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name.endsWith(".css")) return new Proxy({}, { get: (_, key) => key });
      if (name.endsWith("/lib/listener-room-return")) return roomReturnModule.exports;
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    ...globals,
  }, { filename: file });
  return {
    render(props) { cursor = 0; return loadedModule.exports.default(props); },
    runEffect() { return effect(); },
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

test("follow state loads before allowing a toggle; failures can be retried", async () => {
  let complete;
  let requests = 0;
  const client = loadComponent("app/artists/follow-button.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": { default: "a" },
    "../../lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } } },
  }, {
    fetch: async () => {
      requests++;
      if (requests === 1) return new Promise((resolve) => { complete = resolve; });
      return { ok: true, json: async () => ({ following: true }) };
    },
    window: { location: { assign() { throw new Error("Unexpected redirect"); } } },
  });
  const button = () => find(client.render({ handle: "artist" }), (node) => node.type === "button");
  assert.equal(button().props.disabled, true);
  client.runEffect();
  await settle();
  assert.equal(button().props.disabled, true);
  complete({ ok: false, status: 503 });
  await settle();
  assert.equal(button().props.children, "Retry");
  await button().props.onClick();
  await settle();
  assert.equal(button().props.children, "Following ✓");
  assert.equal(requests, 2);
});

test("a signed-in listener can unfollow and follow again", async () => {
  const methods = [];
  let refreshes = 0;
  const client = loadComponent("app/artists/follow-button.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) },
    "next/link": { default: "a" },
    "../../lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } }, error: null }) } } },
  }, {
    fetch: async (_url, options) => {
      methods.push(options.method ?? "GET");
      return { ok: true, json: async () => ({ following: options.method !== "DELETE" }) };
    },
    window: { location: { assign() { throw new Error("Unexpected redirect"); } } },
  });
  const button = () => find(client.render({ handle: "artist" }), (node) => node.type === "button");
  button();
  client.runEffect();
  await settle();
  assert.equal(button().props.children, "Following ✓");
  button().props.onClick();
  await settle();
  assert.equal(button().props.children, "Follow");
  button().props.onClick();
  await settle();
  assert.equal(button().props.children, "Following ✓");
  assert.deepEqual(methods, ["GET", "DELETE", "POST"]);
  assert.equal(refreshes, 2);
});

test("an invalid session offers sign-in instead of assuming the listener does not follow", async () => {
  const client = loadComponent("app/artists/follow-button.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": { default: "a" },
    "../../lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "expired" } }, error: null }) } } },
  }, {
    fetch: async () => ({ ok: false, status: 401 }),
    window: { location: { assign() {} } },
  });
  client.render({ handle: "artist" });
  client.runEffect();
  await settle();
  const tree = client.render({ handle: "artist" });
  assert.ok(find(tree, (node) => node.props?.href === "/signup?follow=artist"));
  assert.equal(find(tree, (node) => node.type === "button").props.children, "Retry");
});

test("a signed-out listener is sent to signup with the artist preserved", async () => {
  let destination;
  const client = loadComponent("app/artists/follow-button.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": { default: "a" },
    "../../lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } } },
  }, {
    fetch: async () => ({ ok: true, json: async () => ({ following: false }) }),
    window: { location: { assign: (value) => { destination = value; } } },
  });
  const button = () => find(client.render({ handle: "artist" }), (node) => node.type === "button");
  button();
  client.runEffect();
  await settle();
  button().props.onClick();
  await settle();
  assert.equal(destination, "/signup?follow=artist");
});

test("follow after Google sign-in succeeds without a wallet lookup", async () => {
  const requests = [];
  let destination;
  const client = loadComponent("app/wallet/callback/page.tsx", {
    "next/link": { default: "a" },
    "../../../lib/oauth-callback": { getOAuthAccessToken: async () => ({ accessToken: "test-token", error: null }) },
    "../../../lib/supabase": { supabase: {}, oauthCallbackUrl: null },
  }, {
    URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, method: options.method });
      return { ok: true };
    },
    window: { location: { search: "?next=%2Fprofile&follow=artist", replace: (value) => { destination = value; } } },
  });
  client.render();
  client.runEffect();
  await settle();
  assert.deepEqual(requests.map((request) => request.url), ["/api/artists/follow"]);
  assert.equal(requests[0].method, "POST");
  assert.equal(destination, "/artists/artist");
});

test("a failed follow after sign-in stays on the callback and offers a retry link", async () => {
  let destination;
  const client = loadComponent("app/wallet/callback/page.tsx", {
    "next/link": { default: "a" },
    "../../../lib/oauth-callback": { getOAuthAccessToken: async () => ({ accessToken: "test-token", error: null }) },
    "../../../lib/supabase": { supabase: {}, oauthCallbackUrl: null },
  }, {
    URLSearchParams,
    fetch: async () => ({ ok: false, json: async () => ({ error: "Follow unavailable." }) }),
    window: { location: { search: "?follow=artist", replace: (value) => { destination = value; } } },
  });
  client.render();
  client.runEffect();
  await settle();
  const tree = client.render();
  assert.equal(destination, undefined);
  assert.ok(find(tree, (node) => node.props?.children === "Follow unavailable."));
  assert.ok(find(tree, (node) => node.props?.href === "/artists/artist"));
});

test("ordinary wallet sign-in still checks the balance and uses its destination", async () => {
  const requests = [];
  let destination;
  const client = loadComponent("app/wallet/callback/page.tsx", {
    "next/link": { default: "a" },
    "../../../lib/oauth-callback": { getOAuthAccessToken: async () => ({ accessToken: "test-token", error: null }) },
    "../../../lib/supabase": { supabase: {}, oauthCallbackUrl: null },
  }, {
    URLSearchParams,
    fetch: async (url) => { requests.push(url); return { ok: true }; },
    window: { location: { search: "?next=%2Fprofile", replace: (value) => { destination = value; } } },
  });
  client.render();
  client.runEffect();
  await settle();
  assert.deepEqual(requests, ["/api/coins/balance"]);
  assert.equal(destination, "/profile");
});

test("following from a room returns to that room; already-following listeners get a return link", async () => {
  const roomId = "12345678-1234-1234-1234-123456789abc";
  const destination = `/?roomId=${roomId}&resume=1#enter-room`;
  let redirect;
  const client = loadComponent("app/artists/follow-button.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": { default: "a" },
    "../../lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test" } }, error: null }) } } },
  }, {
    fetch: async (_url, options) => ({ ok: true, json: async () => ({ following: options.method === "POST" }) }),
    window: { location: { assign: (value) => { redirect = value; } } },
  });
  const render = () => client.render({ handle: "artist", returnRoomId: roomId });
  render();
  client.runEffect();
  await settle();
  find(render(), (node) => node.type === "button").props.onClick();
  await settle();
  assert.equal(redirect, destination);
  assert.ok(find(render(), (node) => node.props?.href === destination));
});

test("follow callback preserves the room on success and on a retry", async () => {
  const roomId = "12345678-1234-1234-1234-123456789abc";
  let redirect;
  let success = true;
  const client = loadComponent("app/wallet/callback/page.tsx", {
    "next/link": { default: "a" },
    "../../../lib/oauth-callback": { getOAuthAccessToken: async () => ({ accessToken: "test", error: null }) },
    "../../../lib/supabase": { supabase: {}, oauthCallbackUrl: null },
  }, {
    URLSearchParams,
    fetch: async () => ({ ok: success, json: async () => ({ error: "Follow unavailable." }) }),
    window: { location: { search: `?follow=artist&roomId=${roomId}`, replace: (value) => { redirect = value; } } },
  });
  client.render();
  client.runEffect();
  await settle();
  assert.equal(redirect, `/?roomId=${roomId}&resume=1#enter-room`);
  success = false;
  client.runEffect();
  await settle();
  assert.ok(find(client.render(), (node) => node.props?.href === `/artists/artist?roomId=${roomId}`));
});

test("signed-out room followers keep their room through signup", async () => {
  const roomId = "12345678-1234-1234-1234-123456789abc";
  let redirect;
  const client = loadComponent("app/artists/follow-button.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": { default: "a" },
    "../../lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } } },
  }, {
    fetch: async () => ({ ok: true, json: async () => ({ following: false }) }),
    window: { location: { assign: (value) => { redirect = value; } } },
  });
  const render = () => client.render({ handle: "artist", returnRoomId: roomId });
  render();
  client.runEffect();
  await settle();
  find(render(), (node) => node.type === "button").props.onClick();
  await settle();
  assert.equal(redirect, `/signup?follow=artist&roomId=${roomId}`);
});

test("signup carries the follow and room through the OAuth callback", async () => {
  const roomId = "12345678-1234-1234-1234-123456789abc";
  let redirectTo;
  const client = loadComponent("app/signup/artist-signup-form.tsx", {
    "../../lib/supabase": { supabase: { auth: { signInWithOAuth: async (options) => { redirectTo = options.options.redirectTo; return { error: null }; } } } },
    "../../lib/artist-tiers": { ARTIST_TIERS: [] },
  }, {
    URLSearchParams,
    window: { location: { origin: "https://example.test", search: `?follow=artist&roomId=${roomId}` } },
  });
  client.render();
  client.runEffect();
  const button = find(client.render(), (node) => node.type === "button" && node.props.onClick && Array.isArray(node.props.children) === false && node.props.children === "Sign up as a listener");
  assert.ok(button);
  button.props.onClick();
  await settle();
  assert.equal(redirectTo, `https://example.test/wallet/callback?next=/profile&follow=artist&roomId=${roomId}`);
});

test("follow callback rejects an invalid room return", async () => {
  let redirect;
  const client = loadComponent("app/wallet/callback/page.tsx", {
    "next/link": { default: "a" },
    "../../../lib/oauth-callback": { getOAuthAccessToken: async () => ({ accessToken: "test", error: null }) },
    "../../../lib/supabase": { supabase: {}, oauthCallbackUrl: null },
  }, {
    URLSearchParams,
    fetch: async () => ({ ok: true }),
    window: { location: { search: "?follow=artist&roomId=https%3A%2F%2Fevil.test", replace: (value) => { redirect = value; } } },
  });
  client.render();
  client.runEffect();
  await settle();
  assert.equal(redirect, "/artists/artist");
});
