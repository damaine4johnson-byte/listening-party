import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "app/room/on-screen-comments.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(code, { module: loaded, exports: loaded.exports, Set, Math });
const { collectFreshComments, visibleComments, isFading, COMMENT_TTL_MS, COMMENT_MAX_VISIBLE } = loaded.exports;

const message = (id, body, name = "Listener") => ({ id, display_name: name, body, created_at: "2026-01-01T00:00:00Z" });

test("chat history loaded on join is remembered but never shown", () => {
  const history = [message("a", "old one"), message("b", "old two")];
  const first = collectFreshComments(history, new Set(), 1000, true);
  assert.equal(first.fresh.length, 0);
  assert.equal(first.seen.size, 2);
  const again = collectFreshComments(history, first.seen, 2000, false);
  assert.equal(again.fresh.length, 0);
});

test("only messages that arrive afterwards are shown, once each", () => {
  const baseline = collectFreshComments([message("a", "old")], new Set(), 1000, true);
  const next = collectFreshComments([message("a", "old"), message("b", "hello", "Mia")], baseline.seen, 5000, false);
  assert.equal(next.fresh.length, 1);
  assert.deepEqual({ ...next.fresh[0] }, { id: "b", name: "Mia", body: "hello", seenAt: 5000 });
  const repeat = collectFreshComments([message("a", "old"), message("b", "hello", "Mia")], next.seen, 6000, false);
  assert.equal(repeat.fresh.length, 0);
});

test("blank messages are skipped and long ones are shortened", () => {
  const baseline = collectFreshComments([], new Set(), 0, true);
  const result = collectFreshComments([message("x", "   \n "), message("y", `a   b ${"z".repeat(300)}`)], baseline.seen, 10, false);
  assert.equal(result.fresh.length, 1);
  assert.equal(result.fresh[0].id, "y");
  assert.ok(result.fresh[0].body.startsWith("a b zzz"));
  assert.equal(result.fresh[0].body.length, 140);
  assert.ok(result.fresh[0].body.endsWith("…"));
});

test("comments expire after the display time and only the newest few show", () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: "n", body: "b", seenAt: 1000 + i }));
  const shown = visibleComments(items, 2000);
  assert.equal(shown.length, COMMENT_MAX_VISIBLE);
  assert.deepEqual(shown.map((item) => item.id), ["3", "4", "5", "6"]);
  assert.equal(visibleComments(items, 1000 + COMMENT_TTL_MS + 10).length, 0);
});

test("a comment starts fading shortly before it expires", () => {
  const item = { id: "1", name: "n", body: "b", seenAt: 0 };
  assert.equal(isFading(item, 1000), false);
  assert.equal(isFading(item, COMMENT_TTL_MS - 100), true);
});
