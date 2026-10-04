import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatMs,
  isPinxExecDetails,
  resultPreview,
  summarizeExecDetails,
  summarizeToolResult,
  type PinxExecDetails,
} from "../src/render/result-summary.ts";

function textResult(text: string, extra: Partial<{ details: unknown; isError: boolean }> = {}) {
  return { content: [{ type: "text", text }], ...extra };
}

test("read results summarize as line counts", () => {
  assert.equal(summarizeToolResult("read", textResult("a\nb\nc")), "3 lines");
  assert.equal(summarizeToolResult("read", textResult("one")), "1 line");
  assert.equal(summarizeToolResult("read", textResult("")), undefined);
});

test("grep/find results summarize as match counts", () => {
  assert.equal(summarizeToolResult("grep", textResult("x:1\nx:2\nx:3")), "3 matches");
  assert.equal(summarizeToolResult("find", textResult("")), "no matches");
});

test("edit/write summarize without leaking content", () => {
  assert.equal(
    summarizeToolResult("edit", textResult("ok", { details: { added: 21, removed: 8 } })),
    "+21 -8",
  );
  assert.equal(summarizeToolResult("edit", textResult("ok")), "edited");
  assert.equal(summarizeToolResult("write", textResult("ok")), "written");
});

test("error results never get a success summary", () => {
  assert.equal(summarizeToolResult("bash", textResult("boom", { isError: true })), undefined);
});

test("generic fallback keeps unknown tools readable and bounded", () => {
  const long = "x".repeat(200);
  const summary = summarizeToolResult(
    "third-party-thing",
    textResult(`HEAD is at abc\nsecond line\n${long}`),
  );
  assert.ok(summary!.startsWith("HEAD is at abc"), summary ?? "");
  assert.ok(summary!.length <= 80, summary ?? "");
});

test("pinx.exec details produce the compact execution line", () => {
  const details: PinxExecDetails = {
    v: 1,
    shape: "pinx.exec",
    runtime: "node",
    revision: 7,
    calls: 8,
    durationMs: 3400,
  };
  assert.equal(summarizeExecDetails(details), "node · revision 7 · 8 calls · 3.4s");
  assert.equal(
    summarizeToolResult("code", textResult("ok", { details })),
    "node · revision 7 · 8 calls · 3.4s",
  );
});

test("pinx.exec repair and job metadata render explicitly", () => {
  const details: PinxExecDetails = {
    v: 1,
    shape: "pinx.exec",
    runtime: "python",
    revision: 9,
    repairedFrom: 8,
    jobId: "j3",
    replay: false,
    durationMs: 420,
  };
  assert.equal(
    summarizeExecDetails(details),
    "python · revision 9 (repaired from 8) · job j3 · 420ms",
  );
});

test("pinx.exec authorized replay is always labeled", () => {
  const details: PinxExecDetails = { v: 1, shape: "pinx.exec", runtime: "bash", replay: true };
  assert.ok(summarizeExecDetails(details).includes("authorized replay"));
});

test("isPinxExecDetails rejects foreign or malformed details", () => {
  assert.equal(isPinxExecDetails({ shape: "pinx.exec" }), false); // missing v
  assert.equal(isPinxExecDetails({ v: 1, shape: "other" }), false);
  assert.equal(isPinxExecDetails(undefined), false);
  assert.equal(isPinxExecDetails("pinx.exec"), false);
});

test("resultPreview bounds expanded output", () => {
  const lines = resultPreview(
    textResult(Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n")),
  );
  assert.equal(lines.length, 8);
  assert.equal(lines[0], "line 0");
});

test("formatMs covers ranges", () => {
  assert.equal(formatMs(420), "420ms");
  assert.equal(formatMs(3400), "3.4s");
  assert.equal(formatMs(61_500), "1m02s");
});
