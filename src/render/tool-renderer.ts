// Tool renderer resolver for pi-ui-next.
//
// Policy: never clobber a renderer another extension or a registered tool
// already provides (next() first). We take over:
//   1. tools with NO registered renderer anywhere (generic fallback keeps
//      third-party tools readable), and
//   2. results carrying pinx.exec details (Code Mode / code-runtime-next),
//      rendered as a compact `code · revision N · M calls · T` line.
// Styles come later (theme engine branch); output here is plain text.
import { Text } from "@earendil-works/pi-tui";
import type { ToolRendererResolver } from "@earendil-works/pi-coding-agent";
import { summarizeCallTitle } from "../timeline/summarize.ts";
import {
  isPinxExecDetails,
  resultPreview,
  summarizeExecDetails,
  summarizeToolResult,
  type ToolResultLike,
} from "./result-summary.ts";

const PREVIEW_LINES_WHEN_EXPANDED = 8;

export function createToolRendererResolver(): ToolRendererResolver {
  return (toolName, next) => {
    const inherited = next();
    if (inherited) return inherited;

    return {
      renderCall: (args, _theme, _context) => new Text(callLine(toolName, args), 0, 0),
      renderResult: (result, options, _theme, _context) =>
        new Text(resultLines(toolName, result, options.expanded).join("\n"), 0, 0),
    };
  };
}

function callLine(toolName: string, args: unknown): string {
  const rec =
    typeof args === "object" && args !== null ? (args as Record<string, unknown>) : undefined;
  const title = summarizeCallTitle(toolName, rec);
  return title ? `${toolName} ${title}` : toolName;
}

function resultLines(
  toolName: string,
  result: ToolResultLike | undefined,
  expanded: boolean,
): string[] {
  const details = result?.details;
  if (isPinxExecDetails(details)) {
    return [summarizeExecDetails(details), ...expandedLines(toolName, result, expanded)];
  }
  const summary = summarizeToolResult(toolName, result);
  if (!summary) return [];
  return [summary, ...expandedLines(toolName, result, expanded)];
}

function expandedLines(
  toolName: string,
  result: ToolResultLike | undefined,
  expanded: boolean,
): string[] {
  if (!expanded) return [];
  void toolName;
  return resultPreview(result, PREVIEW_LINES_WHEN_EXPANDED);
}
