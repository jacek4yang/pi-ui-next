import { test } from "node:test";
import assert from "node:assert/strict";
import type { Theme, ThemeColor, ThemeBg } from "@earendil-works/pi-coding-agent";
import { ActivityTimeline } from "../src/timeline/timeline.ts";
import { createOverviewComponent, renderOverviewCard } from "../src/render/overview.ts";
import { visibleWidth } from "../src/render/width.ts";

function createMockTheme(): Theme {
  return {
    fg: (color: ThemeColor, text: string) => `\x1b]token:${color}\x07${text}\x1b]reset\x07`,
    bg: (color: ThemeBg, text: string) => `\x1b]bg:${color}\x07${text}\x1b]reset\x07`,
    style: (text: string) => text,
    bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
    italic: (text: string) => text,
    underline: (text: string) => text,
    inverse: (text: string) => text,
    strikethrough: (text: string) => text,
  } as unknown as Theme;
}

test("renderOverviewCard creates framed card with exact requested width (U4)", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "c1", toolName: "read", args: { path: "src/index.ts" }, ts: 1000 });
  t.endCall("c1", { isError: false, summary: "3 lines", ts: 1100 });
  t.endTurn(2000);

  const theme = createMockTheme();
  const cardWidth = 80;
  const lines = renderOverviewCard(t, undefined, theme, cardWidth);

  assert.ok(lines.length >= 6);
  // Verify every single line has visibleWidth === cardWidth
  for (let i = 0; i < lines.length; i++) {
    const w = visibleWidth(lines[i]!);
    assert.equal(w, cardWidth, `line ${i} visibleWidth was ${w}, expected ${cardWidth}`);
  }

  // Top border has rounded corner and theme border token
  assert.ok(lines[0]!.includes("╭─"));
  assert.ok(lines[0]!.includes("token:border"));
  // Bottom border has rounded corner
  assert.ok(lines[lines.length - 1]!.includes("╰"));
});

test("renderOverviewCard displays failures in dedicated section", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "c1", toolName: "bash", args: { command: "npm test" }, ts: 1000 });
  t.endCall("c1", { isError: true, summary: "exit 1", ts: 1200 });
  t.endTurn(2000);

  const theme = createMockTheme();
  const lines = renderOverviewCard(t, undefined, theme, 80);

  const joined = lines.join("\n");
  assert.ok(joined.includes("Failures (1)"), joined);
  assert.ok(joined.includes("bash: npm test · exit 1"), joined);
  assert.ok(joined.includes("token:error"), joined);
});

test("renderOverviewCard displays evidence references when present", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.endTurn(2000);

  const theme = createMockTheme();
  const contextStatus = {
    used: { value: 50000, source: "provider-reported" },
    window: 200000,
    engine: "generic-verified",
    archivedRefs: 4,
    eligibleTokens: 12000,
  };

  const lines = renderOverviewCard(t, contextStatus, theme, 80);
  const joined = lines.join("\n");
  assert.ok(joined.includes("4 evidence refs archived (generic-verified)"), joined);
  assert.ok(joined.includes("reclaimable ~12.0k tokens"), joined);
});

test("renderOverviewCard aligns CJK content safely to width", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({
    toolCallId: "c1",
    toolName: "中文测试工具",
    args: { path: "测试/路径/文件.ts" },
    ts: 1000,
  });
  t.endCall("c1", { isError: false, summary: "完成了 10 个测试用例", ts: 1500 });
  t.endTurn(2000);

  const theme = createMockTheme();
  const width = 70;
  const lines = renderOverviewCard(t, undefined, theme, width);

  for (let i = 0; i < lines.length; i++) {
    const w = visibleWidth(lines[i]!);
    assert.equal(w, width, `CJK line ${i} visibleWidth was ${w}, expected ${width}`);
  }
});

test("createOverviewComponent returns a renderable Component", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.endTurn(2000);

  const theme = createMockTheme();
  const comp = createOverviewComponent(t, undefined, theme, 80);
  assert.ok(comp, "should return a component");
  const rendered = comp.render(80);
  assert.ok(Array.isArray(rendered) && rendered.length > 0);
});
