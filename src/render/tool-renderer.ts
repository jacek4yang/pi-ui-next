// Tool renderer resolver for pi-ui-next.
//
// Policy: never clobber a renderer another extension or a registered tool
// already provides (next() first). We take over:
//   1. tools with NO registered renderer anywhere (generic fallback keeps
//      third-party tools readable), and
//   2. results carrying pinx.exec details (Code Mode / code-runtime-next),
//      rendered as a compact `code · revision N · M calls · T` line.
//
// Implements progressive disclosure (Level 2 operation detail), semantic
// theme styling (U3), CJK width safety (U4), and truthful telemetry (U6).

import { Text } from "@earendil-works/pi-tui";
import {
  highlightCode,
  type AgentToolResult,
  type Theme,
  type ToolRendererResolver,
  type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";

export interface ToolRenderContextLike {
  args?: unknown;
  toolCallId?: string;
  isPartial?: boolean;
  expanded?: boolean;
}
import { summarizeCallTitle } from "../timeline/summarize.ts";
import { isPinxExecDetails, type PinxExecDetails, type ToolResultLike } from "./result-summary.ts";
import {
  collapseCommand,
  formatFooterBadge,
  renderDiffLine,
  renderDiffStat,
  renderMuted,
  renderStatusIcon,
  renderToolTitle,
  truncateMiddlePath,
} from "./themed.ts";
import { truncateToWidth } from "./width.ts";

export const INLINE_PREVIEW_LINES = 6;
export const EXPANDED_PREVIEW_LINES = 16;
const DEFAULT_TERMINAL_WIDTH = 100;
const MAX_ARG_PATH_WIDTH = 40;
const MAX_ARG_CMD_WIDTH = 48;

export const CALL_PREVIEW_LINES = 8;

const CODE_EXEC_TOOL_NAMES = new Set([
  "python",
  "py",
  "node",
  "code",
  "js",
  "javascript",
  "ts",
  "typescript",
  "bash",
  "sh",
  "shell",
  "powershell",
  "ps1",
  "code_buffer",
]);

export function isCodeExecutionTool(toolName: string, args?: unknown): boolean {
  if (CODE_EXEC_TOOL_NAMES.has(toolName)) return true;
  if (typeof args === "object" && args !== null) {
    const rec = args as Record<string, unknown>;
    return (
      typeof rec.source === "string" ||
      typeof rec.command === "string" ||
      typeof rec.cmd === "string" ||
      typeof rec.code === "string" ||
      typeof rec.patch === "string" ||
      typeof rec.script === "string" ||
      typeof rec.query === "string"
    );
  }
  return false;
}

export function detectCodeLang(toolName: string, rec?: Record<string, unknown>): string {
  if (toolName === "python" || toolName === "py") return "python";
  if (toolName === "node" || toolName === "code" || toolName === "js" || toolName === "javascript")
    return "javascript";
  if (toolName === "ts" || toolName === "typescript") return "typescript";
  if (toolName === "bash" || toolName === "sh" || toolName === "shell") return "bash";
  if (toolName === "powershell" || toolName === "ps1") return "powershell";
  if (toolName === "code_buffer" && rec?.patch) return "diff";
  if (typeof rec?.runtime === "string") {
    if (rec.runtime === "python" || rec.runtime === "py") return "python";
    if (rec.runtime === "node" || rec.runtime === "code") return "javascript";
    if (rec.runtime === "bash" || rec.runtime === "sh") return "bash";
  }
  if (typeof rec?.language === "string") return rec.language;
  if (typeof rec?.lang === "string") return rec.lang;
  return "plaintext";
}

export function safeHighlightCode(code: string, lang: string, theme: Theme): string[] {
  try {
    const lines = highlightCode(code, lang);
    if (lines && lines.length > 0) return lines;
  } catch {
    // fallback
  }
  return code.split("\n").map((line) => theme.fg("toolOutput", line));
}

export function formatCodeCallLines(
  toolName: string,
  rec: Record<string, unknown> | undefined,
  isPartial: boolean,
  isExpanded: boolean,
  theme: Theme,
  width = DEFAULT_TERMINAL_WIDTH,
): string[] {
  const code = firstString(rec ?? {}, [
    "source",
    "command",
    "cmd",
    "code",
    "patch",
    "script",
    "query",
  ]);

  if (!code) {
    return [truncateToWidth(renderCallLine(toolName, rec, theme), width)];
  }

  const lang = detectCodeLang(toolName, rec);
  const normalizedCode = code.replace(/\r\n/g, "\n").replace(/\t/g, "  ").trimEnd();
  const rawLines = normalizedCode.split("\n");

  const timeoutMs =
    typeof rec?.timeoutMs === "number"
      ? rec.timeoutMs
      : typeof rec?.timeout === "number"
        ? rec.timeout * 1000
        : undefined;
  const timeoutStr = timeoutMs
    ? ` ${renderMuted(theme, `(timeout ${Math.round(timeoutMs / 1000)}s)`)}`
    : "";
  const partialStr = isPartial ? ` ${renderMuted(theme, "running…")}` : "";

  // Single-line shell command ($ npm test)
  if (
    (toolName === "bash" || toolName === "powershell" || toolName === "sh") &&
    rawLines.length === 1
  ) {
    const prompt = toolName === "powershell" ? theme.fg("muted", "PS>") : theme.fg("muted", "$");
    const highlightedCmd = safeHighlightCode(normalizedCode, lang, theme)[0] ?? normalizedCode;
    return [truncateToWidth(`${prompt} ${highlightedCmd}${timeoutStr}${partialStr}`, width)];
  }

  // Header line
  let header = renderToolTitle(theme, toolName);
  if (toolName === "code_buffer" && rec) {
    const action = firstString(rec, ["action"]) ?? "run";
    const name = firstString(rec, ["name"]);
    header += ` ${renderMuted(theme, [action, name].filter(Boolean).join(" "))}`;
  }
  header += `${timeoutStr}${partialStr}`;

  const lines: string[] = [truncateToWidth(header, width)];
  const highlightedLines = safeHighlightCode(normalizedCode, lang, theme);
  const maxLines = isExpanded ? highlightedLines.length : CALL_PREVIEW_LINES;
  const displayLines = highlightedLines.slice(0, maxLines);

  for (const hLine of displayLines) {
    lines.push(truncateToWidth(`  ${hLine}`, width));
  }

  if (highlightedLines.length > maxLines) {
    const remaining = highlightedLines.length - maxLines;
    lines.push(
      truncateToWidth(
        `  ${renderMuted(theme, `... (${remaining} more lines, click to expand)`)}`,
        width,
      ),
    );
  }

  return lines;
}

export function renderCallBlock(
  toolName: string,
  args: unknown,
  theme: Theme,
  context?: ToolRenderContextLike,
  width = DEFAULT_TERMINAL_WIDTH,
): string[] {
  const rec =
    typeof args === "object" && args !== null ? (args as Record<string, unknown>) : undefined;
  const isPartial = Boolean((context as { isPartial?: boolean })?.isPartial ?? false);
  const isExpanded = Boolean((context as { expanded?: boolean })?.expanded ?? false);

  if (isCodeExecutionTool(toolName, args)) {
    return formatCodeCallLines(toolName, rec, isPartial, isExpanded, theme, width);
  }

  return [truncateToWidth(renderCallLine(toolName, args, theme), width)];
}

export function createToolRendererResolver(): ToolRendererResolver {
  return (toolName, next) => {
    const inherited = next();

    return {
      ...(inherited ?? {}),
      renderCall: (args, theme, context) => {
        if (isCodeExecutionTool(toolName, args)) {
          return new Text(renderCallBlock(toolName, args, theme, context).join("\n"), 0, 0);
        }
        if (inherited?.renderCall) {
          return inherited.renderCall(args, theme, context);
        }
        return new Text(renderCallLine(toolName, args, theme), 0, 0);
      },
      renderResult: (result, options, theme, context) => {
        if (
          isPinxExecDetails(result?.details) ||
          isCodeExecutionTool(toolName, context?.args) ||
          !inherited?.renderResult
        ) {
          return new Text(
            renderResultLines(toolName, result, options, theme, context).join("\n"),
            0,
            0,
          );
        }
        return inherited.renderResult(result, options, theme, context);
      },
    };
  };
}

/** Themed single-line call display: `toolTitle` tool name + `muted` args summary. */
export function renderCallLine(toolName: string, args: unknown, theme: Theme): string {
  const title = summarizeCallArgs(toolName, args);
  const toolText = renderToolTitle(theme, toolName);
  if (!title) return toolText;
  return `${toolText} ${renderMuted(theme, title)}`;
}

/** Summarize and bound arguments: path middle truncation or command collapse. */
function summarizeCallArgs(toolName: string, args: unknown): string {
  const rec =
    typeof args === "object" && args !== null ? (args as Record<string, unknown>) : undefined;
  if (!rec) return "";

  switch (toolName) {
    case "read":
    case "write":
    case "edit":
    case "ls": {
      const rawPath = firstString(rec, ["path", "file_path", "filePath"]);
      return rawPath ? truncateMiddlePath(rawPath, MAX_ARG_PATH_WIDTH) : "";
    }
    case "bash": {
      const cmd = firstString(rec, ["command", "cmd"]);
      return cmd ? collapseCommand(cmd, MAX_ARG_CMD_WIDTH) : "";
    }
    case "grep":
    case "find": {
      const pattern = firstString(rec, ["pattern", "query"]);
      return pattern ? collapseCommand(pattern, MAX_ARG_CMD_WIDTH) : "";
    }
    default: {
      return summarizeCallTitle(toolName, rec);
    }
  }
}

/** Render all output lines for a tool result: Header + Preview + Footer. */
export function renderResultLines(
  toolName: string,
  result: AgentToolResult<unknown> | ToolResultLike | undefined,
  options: ToolRenderResultOptions,
  theme: Theme,
  context?: ToolRenderContextLike,
  width = DEFAULT_TERMINAL_WIDTH,
): string[] {
  const lines: string[] = [];
  const isPartial = options.isPartial;
  const isError = Boolean(result?.isError);
  const details = result?.details;

  // 1. Header Line
  const header = buildHeaderLine(toolName, result, isPartial, isError, theme, context);
  lines.push(truncateToWidth(header, width));

  // 2. Preview Lines
  const maxPreview = options.expanded ? EXPANDED_PREVIEW_LINES : INLINE_PREVIEW_LINES;
  const preview = extractPreviewLines(toolName, result, isError, maxPreview, theme);
  for (const pLine of preview) {
    const formatted = formatPreviewLine(pLine, isError, theme);
    lines.push(truncateToWidth(`  ${formatted}`, width));
  }

  // 3. Footer Line (0 empty lines between preview and footer)
  const footer = buildFooterLine(toolName, details, isError, theme);
  if (footer) {
    lines.push(truncateToWidth(footer, width));
  }

  return lines;
}

/** Construct themed header line with status icon, tool title, and outcome summary. */
function buildHeaderLine(
  toolName: string,
  result: ToolResultLike | undefined,
  isPartial: boolean,
  isError: boolean,
  theme: Theme,
  context?: ToolRenderContextLike,
): string {
  let icon: string;
  if (isPartial) {
    icon = renderStatusIcon(theme, "running", "●");
  } else if (isError) {
    icon = renderStatusIcon(theme, "failure", "✗");
  } else {
    icon = renderStatusIcon(theme, "success", "✓");
  }

  const name = renderToolTitle(theme, toolName);
  const summary = formatOutcomeSummary(toolName, result, isPartial, isError, theme, context);

  return summary ? `${icon} ${name} ${summary}` : `${icon} ${name}`;
}

/** Format outcome summary per tool type. */
function formatOutcomeSummary(
  toolName: string,
  result: ToolResultLike | undefined,
  isPartial: boolean,
  isError: boolean,
  theme: Theme,
  context?: ToolRenderContextLike,
): string {
  if (isPartial) {
    return renderMuted(theme, "running…");
  }

  const details = result?.details;
  if (isPinxExecDetails(details)) {
    return formatExecSummary(details, theme);
  }

  const callArgs = context?.args;
  const recArgs =
    typeof callArgs === "object" && callArgs !== null
      ? (callArgs as Record<string, unknown>)
      : undefined;

  const rawText = firstText(result);
  const textLines = nonEmptyLines(rawText);

  if (isError) {
    const firstErr = textLines[0];
    const errMsg = firstErr ? truncateMiddlePath(firstErr, 50) : "failed";
    return theme.fg("error", errMsg);
  }

  switch (toolName) {
    case "read": {
      const path = recArgs ? firstString(recArgs, ["path", "file_path", "filePath"]) : undefined;
      const pathPart = path ? `${truncateMiddlePath(path, MAX_ARG_PATH_WIDTH)} · ` : "";
      const countPart = `${textLines.length} ${textLines.length === 1 ? "line" : "lines"}`;
      return renderMuted(theme, `${pathPart}${countPart}`);
    }
    case "grep":
    case "find": {
      const matchText = textLines.length > 0 ? `${textLines.length} matches` : "no matches";
      return renderMuted(theme, matchText);
    }
    case "ls": {
      const count = textLines.length;
      return renderMuted(theme, `${count} ${count === 1 ? "entry" : "entries"}`);
    }
    case "edit": {
      const path = recArgs ? firstString(recArgs, ["path", "file_path", "filePath"]) : undefined;
      const pathPrefix = path
        ? `${renderMuted(theme, truncateMiddlePath(path, MAX_ARG_PATH_WIDTH))} `
        : "";
      const d = details as
        | { added?: number; removed?: number; addedLines?: number; deletedLines?: number }
        | undefined;
      const added = d?.added ?? d?.addedLines;
      const removed = d?.removed ?? d?.deletedLines;
      if (typeof added === "number" && typeof removed === "number") {
        return `${pathPrefix}${renderDiffStat(theme, added, removed)}`;
      }
      return `${pathPrefix}${renderMuted(theme, "edited")}`;
    }
    case "write": {
      const path = recArgs ? firstString(recArgs, ["path", "file_path", "filePath"]) : undefined;
      const pathPart = path ? `${truncateMiddlePath(path, MAX_ARG_PATH_WIDTH)} · ` : "";
      return renderMuted(theme, `${pathPart}written`);
    }
    case "bash": {
      const cmd = recArgs ? firstString(recArgs, ["command", "cmd"]) : undefined;
      return cmd ? renderMuted(theme, collapseCommand(cmd, MAX_ARG_CMD_WIDTH)) : "";
    }
    default: {
      const head = textLines[0];
      return head ? renderMuted(theme, truncateMiddlePath(head, 60)) : "";
    }
  }
}

/** Formatted compact execution line for pinx.exec details. */
function formatExecSummary(details: PinxExecDetails, theme: Theme): string {
  const parts: string[] = [];
  if (details.revision !== undefined) {
    if (typeof details.repairedFrom === "number") {
      parts.push(`revision ${details.revision} (repaired from ${details.repairedFrom})`);
    } else {
      parts.push(`revision ${details.revision}`);
    }
  }
  if (typeof details.calls === "number") {
    parts.push(`${details.calls} ${details.calls === 1 ? "call" : "calls"}`);
  }
  if (details.jobId) {
    parts.push(`job ${details.jobId}`);
  }
  if (typeof details.durationMs === "number") {
    parts.push(formatDurationSimple(details.durationMs));
  }
  if (details.replay) {
    parts.push("authorized replay");
  }
  return renderMuted(theme, parts.join(" · "));
}

function formatDurationSimple(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format error or traceback lines with semantic tokens. */
function formatErrorOrTracebackLine(line: string, theme: Theme): string {
  // Python traceback header
  if (/^\s*Traceback \(most recent call last\):/i.test(line)) {
    return theme.fg("warning", line);
  }
  // Python traceback frame: File "...", line 12, in foo
  const pyFrameMatch = line.match(/^(\s*File\s+")([^"]+)("\s*,\s*line\s+)(\d+)(.*)/);
  if (pyFrameMatch) {
    const [, pre = "", file = "", mid = "", lineNum = "", rest = ""] = pyFrameMatch;
    return `${theme.fg("muted", pre)}${theme.fg("accent", file)}${theme.fg("muted", mid)}${theme.fg("warning", lineNum)}${theme.fg("muted", rest)}`;
  }
  // Node / JS stack frame: at Object.<anonymous> (/path/to/file.js:12:34)
  if (/^\s*at\s+.*\(?.*:\d+:\d+\)?/i.test(line)) {
    return theme.fg("muted", line);
  }
  // Python syntax error caret: ^ or ^^^
  if (/^\s*\^+\s*$/.test(line)) {
    return theme.fg("accent", theme.bold(line));
  }
  // Exception / Error name: e.g. ZeroDivisionError: division by zero, TypeError: ...
  const errNameMatch = line.match(
    /^([A-Za-z0-9_.]*(?:Error|Exception|Fatal|Fault|Failure)):\s*(.*)/,
  );
  if (errNameMatch) {
    const [, errName = "", msg = ""] = errNameMatch;
    return `${theme.bold(theme.fg("error", `${errName}:`))} ${theme.fg("error", msg)}`;
  }
  // Compiler error: e.g. src/foo.ts:12:5 - error TS2304: ...
  const compilerMatch = line.match(/^([^:]+:\d+:\d+)(.*)/);
  if (compilerMatch) {
    const [, loc = "", rest = ""] = compilerMatch;
    return `${theme.fg("accent", loc)}${theme.fg("error", rest)}`;
  }
  return theme.fg("error", line);
}

/** Format single preview line: error in error color, diff in added/removed/context, normal in toolOutput. */
function formatPreviewLine(line: string, isError: boolean, theme: Theme): string {
  if (isError) {
    return formatErrorOrTracebackLine(line, theme);
  }
  if (line.includes("\x1b[") || line.includes("\x1b]")) {
    return line;
  }
  return renderDiffLine(theme, line);
}

function isExitTrailerLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^\[[\w\s-]+\s+exited\s+.*in\s+[\d.]+s\]$/i.test(trimmed) ||
    /^\[[\w\s-]+\s+exited\s+(?:with\s+code\s+\d+|without\s+status)\]$/i.test(trimmed)
  );
}

function tryFormatJson(text: string, theme: Theme): string[] | undefined {
  const trimmed = text.trim();
  if (!(
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  )) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed);
    const formatted = JSON.stringify(parsed, null, 2);
    return safeHighlightCode(formatted, "json", theme);
  } catch {
    return undefined;
  }
}

/** Extract preview lines up to limit, stripping duplicate runtime exit trailers. */
function extractPreviewLines(
  _toolName: string,
  result: ToolResultLike | undefined,
  _isError: boolean,
  maxLines: number,
  theme?: Theme,
): string[] {
  const text = firstText(result);
  if (!text) return [];

  if (theme) {
    const jsonLines = tryFormatJson(text, theme);
    if (jsonLines) {
      return jsonLines.slice(0, maxLines);
    }
  }

  const rawLines = nonEmptyLines(text);
  const lines = rawLines.filter((l) => !isExitTrailerLine(l));
  return lines.slice(0, maxLines);
}

/** Build footer badge `— runtime · 0.1s · exit 0` when metadata is available. */
function buildFooterLine(
  toolName: string,
  details: unknown,
  isError: boolean,
  theme: Theme,
): string | undefined {
  if (isPinxExecDetails(details)) {
    const runtime = details.runtime ?? toolName;
    return formatFooterBadge(theme, runtime, details.durationMs, isError ? 1 : 0);
  }

  if (typeof details === "object" && details !== null) {
    const d = details as { durationMs?: number; duration?: number; exitCode?: number };
    const duration = d.durationMs ?? d.duration;
    const exitCode = typeof d.exitCode === "number" ? d.exitCode : isError ? 1 : undefined;
    if (duration !== undefined || exitCode !== undefined) {
      return formatFooterBadge(theme, toolName, duration, exitCode);
    }
  }

  if (toolName === "bash" || toolName === "powershell" || toolName === "sh") {
    // shell results always benefit from exit code footer
    return formatFooterBadge(theme, toolName, undefined, isError ? 1 : 0);
  }

  return undefined;
}

function firstText(result: ToolResultLike | undefined): string {
  if (!result || !Array.isArray(result.content)) return "";
  for (const block of result.content) {
    if (
      block &&
      typeof block === "object" &&
      block.type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      return (block as { text: string }).text;
    }
  }
  return "";
}

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter((l) => l.trim().length > 0);
}

function firstString(args: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const val = args[k];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return undefined;
}
