import { test } from "node:test";
import assert from "node:assert/strict";
import { ActivityTimeline } from "../src/timeline/timeline.ts";

test("calls preserve start order even when completed out of order", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "a", toolName: "read", args: { path: "a.ts" }, ts: 1000 });
  t.startCall({ toolCallId: "b", toolName: "grep", args: { pattern: "x" }, ts: 1010 });
  t.endCall("b", { isError: false, ts: 1020 });
  t.endCall("a", { isError: false, ts: 1030 });
  const turn = t.latestTurn()!;
  assert.deepEqual(
    turn.calls.map((c) => c.toolCallId),
    ["a", "b"],
  );
  t.endTurn(1040);
});

test("nested calls attach via parentToolCallId", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "p", toolName: "code", ts: 1000 });
  t.startCall({ toolCallId: "p/1", parentToolCallId: "p", toolName: "read", ts: 1010 });
  t.startCall({ toolCallId: "p/2", parentToolCallId: "p", toolName: "bash", ts: 1020 });
  assert.equal(t.latestTurn()!.calls.length, 1);
  assert.equal(t.childrenOf("p").length, 2);
  assert.equal(t.childrenOf("p")[0]!.toolName, "read");
  t.endTurn(1100);
});

test("failures remain failures even when the parent succeeds (U2)", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "p", toolName: "code", ts: 1000 });
  t.startCall({ toolCallId: "p/1", parentToolCallId: "p", toolName: "bash", ts: 1010 });
  t.endCall("p/1", { isError: true, ts: 1020 });
  t.endCall("p", { isError: false, ts: 1030 });
  const failed = t.failures();
  assert.equal(failed.length, 1);
  assert.equal(failed[0]!.toolCallId, "p/1");
  assert.equal(t.findCall("p")!.status, "success");
  t.endTurn(1100);
});

test("unknown end events are ignored and duplicate starts collapse", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "a", toolName: "read", ts: 1000 });
  t.startCall({ toolCallId: "a", toolName: "read", ts: 1001 });
  t.endCall("missing", { isError: false });
  t.endCall("a", { isError: false, ts: 1010 });
  assert.equal(t.latestTurn()!.calls.length, 1);
  t.endTurn(1100);
});

test("cancelRunning marks only running calls cancelled", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "a", toolName: "read", ts: 1000 });
  t.startCall({ toolCallId: "b", toolName: "bash", ts: 1005 });
  t.endCall("a", { isError: false, ts: 1010 });
  t.cancelRunning(1020);
  assert.equal(t.findCall("a")!.status, "success");
  assert.equal(t.findCall("b")!.status, "cancelled");
  t.endTurn(1100);
});

test("partial previews are bounded", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "a", toolName: "bash", ts: 1000 });
  t.updateCall("a", "x".repeat(5000));
  assert.equal(t.findCall("a")!.partialPreview!.length, 2000);
  t.endTurn(1100);
});

test("turn cap drops extra calls and flags it", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  for (let i = 0; i < 600; i++) {
    t.startCall({ toolCallId: `c${i}`, toolName: "read", ts: 1000 + i });
  }
  assert.ok(t.hasDroppedCalls());
  assert.equal(t.latestTurn()!.calls.length, 500);
  t.endTurn(2000);
});

test("turn pruning keeps the timeline bounded", () => {
  const t = new ActivityTimeline();
  for (let turn = 0; turn < 60; turn++) {
    t.beginTurn("user", turn * 100);
    t.startCall({ toolCallId: `t${turn}-a`, toolName: "read", ts: turn * 100 });
    t.endTurn(turn * 100 + 50);
  }
  assert.equal(t.turnsList().length, 50);
  assert.equal(t.findCall("t0-a"), undefined);
  assert.equal(t.findCall("t59-a")!.toolName, "read");
});

test("reset clears everything", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "a", toolName: "read", ts: 1000 });
  t.reset();
  assert.equal(t.turnsList().length, 0);
  assert.equal(t.findCall("a"), undefined);
});
