import { test } from "node:test";
import assert from "node:assert/strict";
import { ActivityTimeline } from "../src/timeline/timeline.ts";
import { formatDuration, project } from "../src/timeline/project.ts";
import { visibleWidth } from "../src/render/width.ts";

function buildNested(): ActivityTimeline {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({
    toolCallId: "search",
    toolName: "grep",
    args: { pattern: "session_compact" },
    ts: 1000,
  });
  t.endCall("search", { isError: false, summary: "12 matches", ts: 1100 });
  t.startCall({ toolCallId: "read", toolName: "read", args: { path: "src/context.ts" }, ts: 1200 });
  t.endCall("read", { isError: false, summary: "src/context.ts", ts: 1260 });
  t.startCall({ toolCallId: "code", toolName: "code", ts: 1300 });
  t.startCall({ toolCallId: "code/1", parentToolCallId: "code", toolName: "read", ts: 1310 });
  t.endCall("code/1", { isError: false, ts: 1320 });
  t.startCall({
    toolCallId: "code/2",
    parentToolCallId: "code",
    toolName: "bash",
    args: { command: "npm test" },
    ts: 1330,
  });
  t.endCall("code/2", { isError: false, ts: 8500 });
  t.endCall("code", { isError: false, summary: "src/context.ts", ts: 8600 });
  t.startCall({ toolCallId: "edit", toolName: "edit", args: { path: "src/context.ts" }, ts: 8700 });
  t.endCall("edit", { isError: false, summary: "src/context.ts  +21 -8", ts: 8900 });
  t.endTurn(18400);
  return t;
}

test("collapsed projection renders Level 0", () => {
  const t = buildNested();
  const lines = project(t, { width: 120, icons: "unicode", now: 18400 });
  assert.equal(lines[0], "✓ Done · 17.4s");
  assert.equal(lines[1], "");
  assert.deepEqual(lines.slice(2), [
    "├─ ✓ grep     12 matches",
    "├─ ✓ read     src/context.ts",
    "├─ ✓ code     2 calls · 7.3s",
    "└─ ✓ edit     src/context.ts  +21 -8",
  ]);
});

test("expanded projection renders Level 1 for the expanded node", () => {
  const t = buildNested();
  const lines = project(t, {
    width: 120,
    icons: "unicode",
    now: 18400,
    expanded: new Set(["code"]),
  });
  assert.deepEqual(lines.slice(2), [
    "├─ ✓ grep     12 matches",
    "├─ ✓ read     src/context.ts",
    "├─ ✓ code     2 calls · 7.3s",
    "│  ├─ ✓ read",
    "│  └─ ✓ bash     npm test",
    "└─ ✓ edit     src/context.ts  +21 -8",
  ]);
});

test("a nested failure is visible at Level 0 through the parent row (U2)", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "code", toolName: "code", ts: 1000 });
  t.startCall({ toolCallId: "code/1", parentToolCallId: "code", toolName: "bash", ts: 1100 });
  t.endCall("code/1", { isError: true, ts: 1200 });
  t.endCall("code", { isError: false, ts: 1300 });
  t.endTurn(2000);
  const lines = project(t, { width: 120, icons: "unicode", now: 2000 });
  assert.ok(
    lines.some((l) => l.includes("1 failed")),
    lines.join("\n"),
  );
  const expanded = project(t, {
    width: 120,
    icons: "unicode",
    now: 2000,
    expanded: new Set(["code"]),
  });
  assert.ok(
    expanded.some((l) => l.includes("✗ bash")),
    expanded.join("\n"),
  );
});

test("running calls show their title and live duration", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "a", toolName: "bash", args: { command: "sleep 30" }, ts: 1000 });
  const lines = project(t, { width: 120, icons: "unicode", now: 18400 });
  assert.equal(lines[0], "● Working · 17.4s");
  assert.ok(lines[2]!.startsWith("└─ ● bash"), lines[2]);
  assert.ok(lines[2]!.includes("sleep 30"), lines[2]);
});

test("a running call without a title falls back to an ellipsis", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "a", toolName: "webfetch", ts: 1000 });
  const lines = project(t, { width: 120, icons: "unicode", now: 1500 });
  assert.equal(lines[2], "└─ ● webfetch …");
});

test("ascii mode keeps the same layout with different icons", () => {
  const t = buildNested();
  const lines = project(t, { width: 120, icons: "ascii", now: 18400 });
  assert.equal(lines[0], "+ Done · 17.4s");
  assert.equal(lines[2], "| + grep     12 matches");
  assert.equal(lines[5], "\\ + edit     src/context.ts  +21 -8");
});

test("lines never exceed the requested width with CJK paths", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({
    toolCallId: "a",
    toolName: "read",
    args: { path: "src/非常长的中文文件名上下文配置.ts" },
    ts: 1000,
  });
  t.endCall("a", {
    isError: false,
    summary: "src/非常长的中文文件名上下文配置模块文件夹结构.ts",
    ts: 1100,
  });
  t.endTurn(2000);
  for (const width of [80, 120, 160]) {
    const lines = project(t, { width, icons: "unicode", now: 2000 });
    for (const line of lines) {
      assert.ok(visibleWidth(line) <= width, `width ${width}: ${line}`);
    }
  }
});

test("formatDuration covers ms/s/m ranges", () => {
  assert.equal(formatDuration(300), "300ms");
  assert.equal(formatDuration(18400), "18.4s");
  assert.equal(formatDuration(75_000), "1m15s");
});
