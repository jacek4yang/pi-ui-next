import { test } from "node:test";
import assert from "node:assert/strict";
import { Text } from "@earendil-works/pi-tui";
import type {
  Theme,
  ThemeColor,
  ThemeBg,
  AgentToolResult,
  ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import {
  CALL_PREVIEW_LINES,
  createToolRendererResolver,
  EXPANDED_PREVIEW_LINES,
  INLINE_PREVIEW_LINES,
  isCodeExecutionTool,
  renderCallBlock,
  renderCallLine,
  renderResultLines,
  type ToolRenderContextLike,
} from "../src/render/tool-renderer.ts";
import type { PinxExecDetails } from "../src/render/result-summary.ts";

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

function textResult(
  text: string,
  extra: Partial<{ details: unknown; isError: boolean }> = {},
): AgentToolResult<unknown> {
  return {
    content: [{ type: "text" as const, text }],
    details: extra.details,
    isError: extra.isError,
  };
}

test("renderCallLine formats tool name with toolTitle and args with muted", () => {
  const theme = createMockTheme();

  // read: path middle truncation
  const readCall = renderCallLine("read", { path: "src/context.ts" }, theme);
  assert.ok(readCall.includes("token:toolTitle") && readCall.includes("read"), readCall);
  assert.ok(readCall.includes("token:muted") && readCall.includes("src/context.ts"), readCall);

  const longPath = "packages/coding-agent/src/modes/interactive/components/tool-renderer.ts";
  const readLong = renderCallLine("read", { path: longPath }, theme);
  assert.ok(readLong.includes("token:toolTitle") && readLong.includes("read"), readLong);
  assert.ok(readLong.includes("…"), readLong);

  // bash: command collapse
  const bashCall = renderCallLine("bash", { command: "npm test -- --coverage" }, theme);
  assert.ok(bashCall.includes("token:toolTitle") && bashCall.includes("bash"), bashCall);
  assert.ok(
    bashCall.includes("token:muted") && bashCall.includes("npm test -- --coverage"),
    bashCall,
  );

  // grep: pattern
  const grepCall = renderCallLine("grep", { pattern: "session_compact" }, theme);
  assert.ok(grepCall.includes("token:toolTitle") && grepCall.includes("grep"), grepCall);
  assert.ok(grepCall.includes("token:muted") && grepCall.includes("session_compact"), grepCall);
});

test("read result renders path, line count, preview and proper tokens", () => {
  const theme = createMockTheme();
  const ctx: ToolRenderContextLike = { args: { path: "src/render/width.ts" } };
  const lines = renderResultLines(
    "read",
    textResult("line 1\nline 2\nline 3"),
    { expanded: false, isPartial: false },
    theme,
    ctx,
  );

  // Header: success icon, toolTitle, path and line count
  assert.ok(lines[0]!.includes("token:success") && lines[0]!.includes("✓"), lines[0]);
  assert.ok(lines[0]!.includes("token:toolTitle") && lines[0]!.includes("read"), lines[0]);
  assert.ok(lines[0]!.includes("src/render/width.ts"), lines[0]);
  assert.ok(lines[0]!.includes("3 lines"), lines[0]);

  // Preview lines in toolOutput
  assert.ok(lines[1]!.includes("token:toolOutput") && lines[1]!.includes("line 1"), lines[1]);
  assert.ok(lines[2]!.includes("token:toolOutput") && lines[2]!.includes("line 2"), lines[2]);
  assert.ok(lines[3]!.includes("token:toolOutput") && lines[3]!.includes("line 3"), lines[3]);
});

test("grep and find render match count and matched preview lines", () => {
  const theme = createMockTheme();
  const lines = renderResultLines(
    "grep",
    textResult("foo:10\nbar:20"),
    { expanded: false, isPartial: false },
    theme,
  );

  assert.ok(lines[0]!.includes("token:success") && lines[0]!.includes("✓"), lines[0]);
  assert.ok(lines[0]!.includes("token:toolTitle") && lines[0]!.includes("grep"), lines[0]);
  assert.ok(lines[0]!.includes("2 matches"), lines[0]);
  assert.ok(lines[1]!.includes("token:toolOutput") && lines[1]!.includes("foo:10"), lines[1]);
});

test("edit renders diff stats and colors diff preview lines with diff tokens", () => {
  const theme = createMockTheme();
  const ctx: ToolRenderContextLike = { args: { path: "src/themed.ts" } };
  const diffContent = "@@ -1,3 +1,4 @@\n context line\n+added line\n-removed line";
  const lines = renderResultLines(
    "edit",
    textResult(diffContent, { details: { added: 1, removed: 1 } }),
    { expanded: false, isPartial: false },
    theme,
    ctx,
  );

  // Header has diff stats
  assert.ok(lines[0]!.includes("token:toolDiffAdded") && lines[0]!.includes("+1"), lines[0]);
  assert.ok(lines[0]!.includes("token:toolDiffRemoved") && lines[0]!.includes("-1"), lines[0]);

  // Preview has diff tokens
  assert.ok(
    lines[1]!.includes("token:toolDiffContext") && lines[1]!.includes("@@ -1,3 +1,4 @@"),
    lines[1],
  );
  assert.ok(lines[2]!.includes("token:toolOutput") && lines[2]!.includes("context line"), lines[2]);
  assert.ok(
    lines[3]!.includes("token:toolDiffAdded") && lines[3]!.includes("+added line"),
    lines[3],
  );
  assert.ok(
    lines[4]!.includes("token:toolDiffRemoved") && lines[4]!.includes("-removed line"),
    lines[4],
  );
});

test("write renders path and written indicator", () => {
  const theme = createMockTheme();
  const ctx: ToolRenderContextLike = { args: { path: "src/new-file.ts" } };
  const lines = renderResultLines(
    "write",
    textResult("const x = 1;\n"),
    { expanded: false, isPartial: false },
    theme,
    ctx,
  );

  assert.ok(lines[0]!.includes("token:toolTitle") && lines[0]!.includes("write"), lines[0]);
  assert.ok(lines[0]!.includes("src/new-file.ts · written"), lines[0]);
});

test("bash renders command, output, and footer badge with exit code", () => {
  const theme = createMockTheme();
  const ctx: ToolRenderContextLike = { args: { command: "npm test" } };

  // Success bash
  const okLines = renderResultLines(
    "bash",
    textResult("PASS test/width.test.ts", { details: { exitCode: 0, durationMs: 120 } }),
    { expanded: false, isPartial: false },
    theme,
    ctx,
  );
  assert.ok(okLines[0]!.includes("token:success") && okLines[0]!.includes("✓"), okLines[0]);
  assert.ok(okLines[0]!.includes("npm test"), okLines[0]);
  // Footer: muted exit 0
  const footerOk = okLines[okLines.length - 1]!;
  assert.ok(
    footerOk.includes("token:muted") && footerOk.includes("— bash · 120ms · exit 0"),
    footerOk,
  );

  // Failed bash
  const failLines = renderResultLines(
    "bash",
    textResult("FAIL test/width.test.ts\nAssertionError\n at line 12\n exit 1", {
      isError: true,
      details: { exitCode: 1, durationMs: 250 },
    }),
    { expanded: false, isPartial: false },
    theme,
    ctx,
  );
  assert.ok(failLines[0]!.includes("token:error") && failLines[0]!.includes("✗"), failLines[0]);
  // Body has error colors
  assert.ok(failLines[1]!.includes("token:error"), failLines[1]);
  // Footer has error exit code
  const footerFail = failLines[failLines.length - 1]!;
  assert.ok(footerFail.includes("token:error") && footerFail.includes("exit 1"), footerFail);
});

test("code/node/python with pinx.exec details renders compact execution line and footer", () => {
  const theme = createMockTheme();
  const details: PinxExecDetails = {
    v: 1,
    shape: "pinx.exec",
    runtime: "node",
    revision: 7,
    calls: 8,
    durationMs: 3400,
  };

  const lines = renderResultLines(
    "code",
    textResult("result output", { details }),
    { expanded: false, isPartial: false },
    theme,
  );

  assert.ok(lines[0]!.includes("token:success") && lines[0]!.includes("✓"), lines[0]);
  assert.ok(lines[0]!.includes("token:toolTitle") && lines[0]!.includes("code"), lines[0]);
  assert.ok(lines[0]!.includes("revision 7 · 8 calls · 3.4s"), lines[0]);
  // Footer has runtime and duration
  const footer = lines[lines.length - 1]!;
  assert.ok(footer.includes("token:muted") && footer.includes("— node · 3.4s"), footer);
});

test("partial result renders running icon with accent token", () => {
  const theme = createMockTheme();
  const lines = renderResultLines(
    "bash",
    textResult("running build step 1..."),
    { expanded: false, isPartial: true },
    theme,
  );

  assert.ok(lines[0]!.includes("token:accent") && lines[0]!.includes("●"), lines[0]);
  assert.ok(lines[0]!.includes("running…"), lines[0]);
});

test("preview line count respects expanded vs inline bounds", () => {
  const theme = createMockTheme();
  const bigOutput = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");

  const inline = renderResultLines(
    "read",
    textResult(bigOutput),
    { expanded: false, isPartial: false },
    theme,
  );
  // header + 6 preview lines
  assert.equal(inline.length, 1 + INLINE_PREVIEW_LINES);

  const expanded = renderResultLines(
    "read",
    textResult(bigOutput),
    { expanded: true, isPartial: false },
    theme,
  );
  // header + 16 preview lines
  assert.equal(expanded.length, 1 + EXPANDED_PREVIEW_LINES);
});

test("createToolRendererResolver yields to inherited but intercepts pinx.exec", () => {
  const resolver = createToolRendererResolver();

  // Case 1: no inherited renderer
  const custom = resolver("custom_tool", () => undefined);
  assert.ok(custom?.renderCall, "should provide renderCall");
  assert.ok(custom?.renderResult, "should provide renderResult");

  // Case 2: inherited renderer exists
  let inheritedCallInvoked = false;
  let inheritedResultInvoked = false;
  const dummyText = new Text("", 0, 0);
  const inheritedMock = {
    renderCall: () => {
      inheritedCallInvoked = true;
      return dummyText;
    },
    renderResult: () => {
      inheritedResultInvoked = true;
      return dummyText;
    },
  };

  const intercepted = resolver("my_tool", () => inheritedMock);
  assert.ok(intercepted);

  type ContextParam = Parameters<NonNullable<typeof intercepted.renderCall>>[2];
  const dummyContext = {
    args: {},
    toolCallId: "test_call",
    invalidate: () => {},
    lastComponent: undefined,
  } as unknown as ContextParam;

  // Call passes through
  intercepted.renderCall?.({}, createMockTheme(), dummyContext);
  assert.ok(inheritedCallInvoked);

  // Non-pinx result passes through
  intercepted.renderResult?.(
    { content: [], details: undefined },
    { expanded: false, isPartial: false },
    createMockTheme(),
    dummyContext,
  );
  assert.ok(inheritedResultInvoked);

  // Pinx.exec result is intercepted by pi-ui-next
  const pinxDetails: PinxExecDetails = {
    v: 1,
    shape: "pinx.exec",
    runtime: "node",
    revision: 2,
    calls: 1,
  };
  inheritedResultInvoked = false;
  const comp = intercepted.renderResult?.(
    { content: [{ type: "text", text: "pinx output" }], details: pinxDetails },
    { expanded: false, isPartial: false },
    createMockTheme(),
    dummyContext,
  );
  assert.equal(inheritedResultInvoked, false, "should not call inherited for pinx.exec");
  assert.ok(comp, "should return custom Component");
});

test("isCodeExecutionTool identifies code/shell tools and args with source/command", () => {
  assert.ok(isCodeExecutionTool("python"));
  assert.ok(isCodeExecutionTool("node"));
  assert.ok(isCodeExecutionTool("bash"));
  assert.ok(isCodeExecutionTool("powershell"));
  assert.ok(isCodeExecutionTool("code_buffer"));
  assert.ok(isCodeExecutionTool("custom", { source: "print(1)" }));
  assert.ok(isCodeExecutionTool("custom", { command: "ls" }));
  assert.ok(isCodeExecutionTool("custom", { code: "1 + 1" }));
  assert.ok(!isCodeExecutionTool("read", { path: "foo.ts" }));
  assert.ok(!isCodeExecutionTool("grep", { pattern: "bar" }));
});

test("renderCallBlock formats python call without raw JSON escaping", () => {
  const theme = createMockTheme();
  const args = {
    source: 'print("Hello from Python!")\nimport sys\nprint(sys.version)',
  };
  const lines = renderCallBlock("python", args, theme);

  // Line 0: python tool title
  assert.ok(lines[0]!.includes("token:toolTitle") && lines[0]!.includes("python"), lines[0]);
  // Indented code lines
  assert.ok(lines[1]!.includes('print("Hello from Python!")'), lines[1]);
  assert.ok(lines[2]!.includes("import sys"), lines[2]);
  assert.ok(lines[3]!.includes("print(sys.version)"), lines[3]);

  // Must NOT contain raw JSON escaping like source="..." or \n
  for (const line of lines) {
    assert.ok(!line.includes('source="'), `leaked source=: ${line}`);
    assert.ok(!line.includes("\\n"), `leaked literal \\n: ${line}`);
  }
});

test("renderCallBlock formats single-line and multi-line bash calls", () => {
  const theme = createMockTheme();

  // Single-line bash
  const single = renderCallBlock("bash", { command: "npm test" }, theme);
  assert.equal(single.length, 1);
  assert.ok(single[0]!.includes("$") && single[0]!.includes("npm test"), single[0]);

  // Multi-line bash
  const multi = renderCallBlock("bash", { command: "echo step 1\necho step 2" }, theme);
  assert.ok(multi[0]!.includes("bash"), multi[0]);
  assert.ok(multi[1]!.includes("echo step 1"), multi[1]);
  assert.ok(multi[2]!.includes("echo step 2"), multi[2]);
});

test("renderCallBlock bounds long multi-line code calls in collapsed mode", () => {
  const theme = createMockTheme();
  const source = Array.from({ length: 14 }, (_, i) => `line_${i + 1} = ${i + 1}`).join("\n");

  const collapsed = renderCallBlock("python", { source }, theme, { expanded: false });
  // 1 header + 8 code lines + 1 continuation hint = 10 lines
  assert.equal(collapsed.length, 1 + CALL_PREVIEW_LINES + 1);
  assert.ok(
    collapsed[collapsed.length - 1]!.includes("more lines"),
    collapsed[collapsed.length - 1],
  );

  const expanded = renderCallBlock("python", { source }, theme, { expanded: true });
  assert.equal(expanded.length, 1 + 14);
});

test("renderResultLines strips embedded runtime exit trailer preventing duplicate footers", () => {
  const theme = createMockTheme();
  const rawOutput =
    "Hello from Python!\n3.12.3 (main, Apr 10 2024)\n[python exited with code 0 in 0.1s]";
  const details: PinxExecDetails = {
    v: 1,
    shape: "pinx.exec",
    runtime: "python",
    durationMs: 110,
  };

  const lines = renderResultLines(
    "python",
    textResult(rawOutput, { details }),
    { expanded: false, isPartial: false },
    theme,
  );

  // Header has python status
  assert.ok(lines[0]!.includes("token:success") && lines[0]!.includes("python"), lines[0]);

  // Preview lines have the stdout
  assert.ok(lines[1]!.includes("Hello from Python!"), lines[1]);
  assert.ok(lines[2]!.includes("3.12.3"), lines[2]);

  // Trailer "[python exited with code 0 in 0.1s]" must NOT appear in preview lines!
  for (let i = 1; i < lines.length - 1; i++) {
    assert.ok(
      !lines[i]!.includes("[python exited"),
      `duplicate exit trailer in line ${i}: ${lines[i]}`,
    );
  }

  // Footer has single clean footer badge
  const footer = lines[lines.length - 1]!;
  assert.ok(footer.includes("— python · 110ms · exit 0"), footer);
});

test("renderResultLines formats python traceback with styled frames and error name", () => {
  const theme = createMockTheme();
  const tb = [
    "Traceback (most recent call last):",
    '  File "app.py", line 10, in main',
    "ZeroDivisionError: division by zero",
  ].join("\n");

  const lines = renderResultLines(
    "python",
    textResult(tb, { isError: true }),
    { expanded: false, isPartial: false },
    theme,
  );

  assert.ok(lines[0]!.includes("token:error"), lines[0]);
  // Traceback header in warning
  assert.ok(lines[1]!.includes("token:warning") && lines[1]!.includes("Traceback"), lines[1]);
  // File frame with accented path and warning line number
  assert.ok(lines[2]!.includes("token:accent") && lines[2]!.includes("app.py"), lines[2]);
  assert.ok(lines[2]!.includes("token:warning") && lines[2]!.includes("10"), lines[2]);
  // Error name in bold error
  assert.ok(
    lines[3]!.includes("token:error") && lines[3]!.includes("ZeroDivisionError:"),
    lines[3],
  );
});

test("createToolRendererResolver intercepts python tool calls and results even when inherited has no renderCall", () => {
  const theme = createMockTheme();
  const resolver = createToolRendererResolver();

  // Simulated inherited definition from pi-code-runtime-next (has parameters/execute but no renderCall)
  const inheritedRuntimeTool: ToolRenderers = {};

  const resolved = resolver("python", () => inheritedRuntimeTool);
  assert.ok(resolved?.renderCall, "should provide renderCall for python");
  assert.ok(resolved?.renderResult, "should provide renderResult for python");

  type ContextParam = Parameters<NonNullable<typeof resolved.renderCall>>[2];
  const dummyContext = {
    args: { source: 'print("Hello from Python!")' },
    toolCallId: "test_py",
  } as unknown as ContextParam;

  // Render call
  const callComp = resolved.renderCall?.(
    { source: 'print("Hello from Python!")' },
    theme,
    dummyContext,
  );
  assert.ok(callComp instanceof Text);
  const callText = (callComp as Text).render(100).join("\n");
  assert.ok(callText.includes("python"), callText);
  assert.ok(callText.includes('print("Hello from Python!")'), callText);
  assert.ok(!callText.includes('source="'), callText);

  // Render result
  const resultComp = resolved.renderResult?.(
    textResult("Hello from Python!", {
      details: { v: 1, shape: "pinx.exec", runtime: "python", durationMs: 50 },
    }),
    { expanded: false, isPartial: false },
    theme,
    dummyContext,
  );
  assert.ok(resultComp instanceof Text);
  const resultText = (resultComp as Text).render(100).join("\n");
  assert.ok(resultText.includes("✓"), resultText);
  assert.ok(resultText.includes("Hello from Python!"), resultText);
  assert.ok(resultText.includes("— python"), resultText);
});
