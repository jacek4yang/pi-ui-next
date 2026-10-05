// Compact human titles for tool calls. Raw JSON is never the default human
// presentation (U1): every tool maps to a short label + outcome summary.

const MAX_ARG_SUMMARY = 48;

function firstString(
  args: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!args) return undefined;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function asRecord(args: unknown): Record<string, unknown> | undefined {
  if (typeof args === "object" && args !== null && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return undefined;
}

/** Short label for the call itself (before the result is known). */
export function summarizeCallTitle(toolName: string, args: unknown): string {
  const rec = asRecord(args);
  switch (toolName) {
    case "read":
    case "write":
    case "edit":
    case "ls":
      return firstString(rec, ["path", "file_path", "filePath"]) ?? "";
    case "bash": {
      const command = firstString(rec, ["command", "cmd"]);
      return command ? collapse(command) : "";
    }
    case "code_buffer": {
      const action = firstString(rec, ["action"]) ?? "run";
      const name = firstString(rec, ["name"]);
      return name ? `${action} ${name}` : action;
    }
    case "grep":
    case "find":
      return firstString(rec, ["pattern", "query"]) ?? "";
    default: {
      // Generic fallback: first string-valued argument, else nothing.
      if (rec) {
        for (const value of Object.values(rec)) {
          if (typeof value === "string" && value.length > 0) return collapse(value);
        }
      }
      return "";
    }
  }
}

/** Collapse whitespace and bound length for single-line display. */
export function collapse(text: string, max = MAX_ARG_SUMMARY): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

/** Result-side summary extracted from a bounded result preview. */
export function summarizeResult(toolName: string, preview: string): string | undefined {
  const text = preview.trim();
  if (!text) return undefined;
  switch (toolName) {
    case "grep":
    case "find": {
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      return lines.length > 0 ? `${lines.length} matches` : "no matches";
    }
    case "bash":
      return undefined; // duration/exit carried elsewhere; command already shown
    default:
      return undefined;
  }
}
