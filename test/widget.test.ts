import { test } from "node:test";
import assert from "node:assert/strict";
import type { Theme, ThemeColor, ThemeBg } from "@earendil-works/pi-coding-agent";
import { ActivityTimeline } from "../src/timeline/timeline.ts";
import { buildWidgetLines, formatK, type LatestContextStatus } from "../src/render/widget.ts";
import { visibleWidth } from "../src/render/width.ts";

function createMockTheme(): Theme {
  return {
    fg: (color: ThemeColor, text: string) => `\x1b]token:${color}\x07${text}\x1b]reset\x07`,
    bg: (color: ThemeBg, text: string) => `\x1b]bg:${color}\x07${text}\x1b]reset\x07`,
    style: (text: string) => text,
    bold: (text: string) => text,
    italic: (text: string) => text,
    underline: (text: string) => text,
    inverse: (text: string) => text,
    strikethrough: (text: string) => text,
  } as unknown as Theme;
}

test("formatK formats numbers into compact k-suffixes", () => {
  assert.equal(formatK(500), "500");
  assert.equal(formatK(1000), "1.0k");
  assert.equal(formatK(114000), "114.0k");
  assert.equal(formatK(272000), "272.0k");
});

test("buildWidgetLines returns empty when timeline has no turns", () => {
  const t = new ActivityTimeline();
  const theme = createMockTheme();
  assert.deepEqual(buildWidgetLines(t, undefined, undefined, theme), []);
});

test("Line 1 renders running status, duration, call count and warnings for failures", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "c1", toolName: "read", ts: 1000 });
  t.endCall("c1", { isError: false, ts: 1200 });
  t.startCall({ toolCallId: "c2", toolName: "bash", ts: 1300 });
  t.endCall("c2", { isError: true, ts: 1500 });
  t.startCall({ toolCallId: "c3", toolName: "read", ts: 1600 }); // running

  const theme = createMockTheme();
  const lines = buildWidgetLines(t, undefined, undefined, theme, 120, 2000);

  // Line 1: running icon, Working, 3 calls, 1 failed in warning token
  assert.equal(lines.length, 1);
  const line1 = lines[0]!;
  assert.ok(line1.includes("token:accent") && line1.includes("●"), line1);
  assert.ok(line1.includes("Working"), line1);
  assert.ok(line1.includes("3 calls"), line1);
  assert.ok(line1.includes("token:warning") && line1.includes("1 failed"), line1);
});

test("Line 2 renders context pressure bar and truthful token figures", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.endTurn(2000);

  const theme = createMockTheme();
  const contextStatus: LatestContextStatus = {
    used: { value: 114000, source: "provider-reported" },
    window: 272000,
    engine: "generic-verified",
    archivedRefs: 3,
    eligibleTokens: 18000,
  };

  const lines = buildWidgetLines(t, contextStatus, undefined, theme, 120);
  assert.equal(lines.length, 2);

  const line2 = lines[1]!;
  // Progress bar present (114k / 272k = 42% -> <50% so success token)
  assert.ok(line2.includes("42%"), line2);
  assert.ok(line2.includes("token:success"), line2);
  assert.ok(line2.includes("114.0k/272.0k (provider-reported)"), line2);
  assert.ok(line2.includes("reclaimable ~18.0k"), line2);
  assert.ok(line2.includes("3 evidence refs"), line2);
  assert.ok(line2.includes("engine generic-verified"), line2);
});

test("Line 3 renders latest activity with accent token", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.endTurn(2000);

  const theme = createMockTheme();
  const activity = "context.hygiene: replaced 4 calls with evidence refs";
  const lines = buildWidgetLines(t, undefined, activity, theme, 120);

  assert.equal(lines.length, 2);
  const line3 = lines[1]!;
  assert.ok(line3.includes("token:accent"), line3);
  assert.ok(line3.includes(activity), line3);
});

test("widget lines are safely bounded to terminal width (U4 CJK safe)", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({
    toolCallId: "c1",
    toolName: "非常长的中文工具名称测试长路径等等等等",
    ts: 1000,
  });

  const theme = createMockTheme();
  const activity =
    "这是一个非常冗长的活动事件通知，包含了大量的汉字，用于验证在狭窄的终端宽度（如 40 列）下绝对不会溢出";
  const lines = buildWidgetLines(t, undefined, activity, theme, 40);

  for (const line of lines) {
    assert.ok(
      visibleWidth(line) <= 40,
      `visible width ${visibleWidth(line)} exceeded 40: "${line}"`,
    );
  }
});
