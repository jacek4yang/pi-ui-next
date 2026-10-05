import { test } from "node:test";
import assert from "node:assert/strict";
import type { Theme, ThemeColor, ThemeBg } from "@earendil-works/pi-coding-agent";
import {
  collapseCommand,
  formatFooterBadge,
  renderAccent,
  renderDiffLine,
  renderDiffStat,
  renderDim,
  renderError,
  renderMuted,
  renderProgressBar,
  renderSeparator,
  renderStatusIcon,
  renderSuccess,
  renderToolTitle,
  renderWarning,
  truncateMiddlePath,
} from "../src/render/themed.ts";
import { visibleWidth } from "../src/render/width.ts";

function createMockTheme(): Theme {
  return {
    fg: (color: ThemeColor, text: string) => `[fg:${color}]${text}[/fg]`,
    bg: (color: ThemeBg, text: string) => `[bg:${color}]${text}[/bg]`,
    style: (text: string) => text,
    bold: (text: string) => text,
    italic: (text: string) => text,
    underline: (text: string) => text,
    inverse: (text: string) => text,
    strikethrough: (text: string) => text,
  } as unknown as Theme;
}

test("renderStatusIcon colors according to semantic roles (U3)", () => {
  const theme = createMockTheme();
  assert.equal(renderStatusIcon(theme, "success", "✓"), "[fg:success]✓[/fg]");
  assert.equal(renderStatusIcon(theme, "failure", "✗"), "[fg:error]✗[/fg]");
  assert.equal(renderStatusIcon(theme, "warning", "⚠"), "[fg:warning]⚠[/fg]");
  assert.equal(renderStatusIcon(theme, "running", "●"), "[fg:accent]●[/fg]");
  assert.equal(renderStatusIcon(theme, "cancelled", "⊘"), "[fg:muted]⊘[/fg]");
});

test("basic text emphasis helpers apply correct semantic tokens", () => {
  const theme = createMockTheme();
  assert.equal(renderToolTitle(theme, "read"), "[fg:toolTitle]read[/fg]");
  assert.equal(renderMuted(theme, "3.4s"), "[fg:muted]3.4s[/fg]");
  assert.equal(renderDim(theme, "hint"), "[fg:dim]hint[/fg]");
  assert.equal(renderAccent(theme, "working"), "[fg:accent]working[/fg]");
  assert.equal(renderError(theme, "boom"), "[fg:error]boom[/fg]");
  assert.equal(renderWarning(theme, "caution"), "[fg:warning]caution[/fg]");
  assert.equal(renderSuccess(theme, "done"), "[fg:success]done[/fg]");
  assert.equal(renderSeparator(theme), "[fg:muted]·[/fg]");
});

test("renderDiffStat colors additions and deletions", () => {
  const theme = createMockTheme();
  assert.equal(
    renderDiffStat(theme, 21, 8),
    "[fg:toolDiffAdded]+21[/fg] [fg:toolDiffRemoved]-8[/fg]",
  );
});

test("renderDiffLine differentiates +, -, @@ and normal text", () => {
  const theme = createMockTheme();
  assert.equal(renderDiffLine(theme, "+ added line"), "[fg:toolDiffAdded]+ added line[/fg]");
  assert.equal(renderDiffLine(theme, "- removed line"), "[fg:toolDiffRemoved]- removed line[/fg]");
  assert.equal(
    renderDiffLine(theme, "@@ -1,3 +1,3 @@"),
    "[fg:toolDiffContext]@@ -1,3 +1,3 @@[/fg]",
  );
  assert.equal(renderDiffLine(theme, " context line"), "[fg:toolOutput] context line[/fg]");
});

test("renderProgressBar renders 10 blocks with 50%/80% threshold tiers", () => {
  const theme = createMockTheme();

  // < 50% -> success token
  const bar0 = renderProgressBar(theme, 0);
  assert.ok(bar0.includes("[fg:success]░░░░░░░░░░[/fg]"), bar0);
  assert.ok(bar0.includes("[fg:success]0%[/fg]"), bar0);

  const bar42 = renderProgressBar(theme, 0.42);
  assert.ok(bar42.includes("[fg:success]████░░░░░░[/fg]"), bar42);
  assert.ok(bar42.includes("[fg:success]42%[/fg]"), bar42);

  // 50% ~ 79% -> warning token
  const bar50 = renderProgressBar(theme, 0.5);
  assert.ok(bar50.includes("[fg:warning]█████░░░░░[/fg]"), bar50);
  assert.ok(bar50.includes("[fg:warning]50%[/fg]"), bar50);

  const bar79 = renderProgressBar(theme, 0.79);
  assert.ok(bar79.includes("[fg:warning]████████░░[/fg]"), bar79);
  assert.ok(bar79.includes("[fg:warning]79%[/fg]"), bar79);

  // >= 80% -> error token
  const bar80 = renderProgressBar(theme, 0.8);
  assert.ok(bar80.includes("[fg:error]████████░░[/fg]"), bar80);
  assert.ok(bar80.includes("[fg:error]80%[/fg]"), bar80);

  const bar100 = renderProgressBar(theme, 1.0);
  assert.ok(bar100.includes("[fg:error]██████████[/fg]"), bar100);
  assert.ok(bar100.includes("[fg:error]100%[/fg]"), bar100);

  // Clamping of extreme values
  const barNeg = renderProgressBar(theme, -0.5);
  assert.ok(barNeg.includes("0%"));
  const barOver = renderProgressBar(theme, 1.5);
  assert.ok(barOver.includes("100%"));
});

test("[U4] truncateMiddlePath keeps endpoints and bounds visible width", () => {
  const short = "src/index.ts";
  assert.equal(truncateMiddlePath(short, 20), short);

  const longPosix = "packages/coding-agent/src/modes/interactive/components/tool-renderer.ts";
  const truncatedPosix = truncateMiddlePath(longPosix, 35);
  assert.ok(truncatedPosix.startsWith("packages/…/"), truncatedPosix);
  assert.ok(truncatedPosix.endsWith("tool-renderer.ts"), truncatedPosix);
  assert.ok(visibleWidth(truncatedPosix) <= 35, `width was ${visibleWidth(truncatedPosix)}`);

  const longWin = "D:\\Workspace\\make-pi-great-again\\packages\\core\\src\\index.ts";
  const truncatedWin = truncateMiddlePath(longWin, 35);
  assert.ok(truncatedWin.startsWith("D:\\…\\"), truncatedWin);
  assert.ok(truncatedWin.endsWith("index.ts"), truncatedWin);
  assert.ok(visibleWidth(truncatedWin) <= 35, `width was ${visibleWidth(truncatedWin)}`);

  // CJK paths
  const cjkPath = "src/测试目录/很深的多层路径/最终文件.ts";
  const truncatedCjk = truncateMiddlePath(cjkPath, 20);
  assert.ok(visibleWidth(truncatedCjk) <= 20, `CJK width was ${visibleWidth(truncatedCjk)}`);

  // Edge cases
  assert.equal(truncateMiddlePath("long/path/file.ts", 0), "");
  assert.ok(visibleWidth(truncateMiddlePath("long/path/file.ts", 3)) <= 3);
});

test("collapseCommand single-lines and bounds commands to 48 cols", () => {
  const simple = "npm test";
  assert.equal(collapseCommand(simple), "npm test");

  const multiline = "git commit -m \\\n  'feat: new feature'   --no-verify";
  assert.equal(collapseCommand(multiline), "git commit -m 'feat: new feature' --no-verify");

  const longCmd =
    "npx tsx --test test/golden.test.ts --coverage-threshold 90 --reporter spec --run-in-band";
  const collapsed = collapseCommand(longCmd, 48);
  assert.ok(visibleWidth(collapsed) <= 48, `width was ${visibleWidth(collapsed)}`);
  assert.ok(collapsed.endsWith("…"), collapsed);

  // CJK in command
  const cjkCmd = "git commit -m 'feat: 这是一个非常详细且长度超过了限制的说明文字' --verbose";
  const cjkCollapsed = collapseCommand(cjkCmd, 40);
  assert.ok(
    visibleWidth(cjkCollapsed) <= 40,
    `CJK command width was ${visibleWidth(cjkCollapsed)}`,
  );
});

test("formatFooterBadge handles success and non-zero exit codes truthfully (U6)", () => {
  const theme = createMockTheme();

  // Normal exit 0: all muted
  const badge0 = formatFooterBadge(theme, "node", 120, 0);
  assert.equal(badge0, "[fg:muted]— node · 120ms · exit 0[/fg]");

  // Non-zero exit: exit code in error color
  const badge1 = formatFooterBadge(theme, "bash", 1400, 1);
  assert.equal(badge1, "[fg:muted]— bash · 1.4s · [/fg][fg:error]exit 1[/fg]");

  // No exit code: duration only
  const badgeNoExit = formatFooterBadge(theme, "python", 500);
  assert.equal(badgeNoExit, "[fg:muted]— python · 500ms[/fg]");
});
