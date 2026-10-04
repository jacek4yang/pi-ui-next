// Result-side summaries for tool results. Pure functions: given Pi's tool
// result shape, produce a bounded human summary line. Raw JSON is never the
// default presentation (U1); everything here is bounded.

const MAX_SUMMARY = 80;
const MAX_PREVIEW_CHARS = 400;

interface TextBlock {
  type: string;
  text?: string;
}

export interface ToolResultLike {
  content?: Array<TextBlock | { type: "image" }>;
  details?: unknown;
  isError?: boolean;
}

function firstText(result: ToolResultLike): string {
  const blocks = result.content;
  if (!Array.isArray(blocks)) return "";
  for (const block of blocks) {
    if (
      block &&
      typeof block === "object" &&
      block.type === "text" &&
      typeof block.text === "string"
    ) {
      return block.text;
    }
  }
  return "";
}

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter((l) => l.trim().length > 0);
}

function bound(text: string, max = MAX_SUMMARY): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

/** Structured execution metadata from the pinx.exec contract (CONTRACTS.md §5). */
export interface PinxExecDetails {
  v: 1;
  shape: "pinx.exec";
  sourceId?: string;
  revision?: number;
  runtime?: "node" | "python" | "bash" | "quickjs";
  calls?: number;
  durationMs?: number;
  jobId?: string;
  repairedFrom?: number;
  replay?: boolean;
}

export function isPinxExecDetails(details: unknown): details is PinxExecDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    (details as { shape?: unknown }).shape === "pinx.exec" &&
    (details as { v?: unknown }).v === 1
  );
}

/**
 * Compact summary for a completed tool result. Returns undefined when nothing
 * better than the call title is known.
 */
export function summarizeToolResult(
  toolName: string,
  result: ToolResultLike | undefined,
): string | undefined {
  if (!result || result.isError) return undefined;
  const details = result.details;
  if (isPinxExecDetails(details)) return summarizeExecDetails(details);

  const text = firstText(result);
  const lines = nonEmptyLines(text);
  switch (toolName) {
    case "read": {
      if (lines.length === 0) return text.length > 0 ? "empty" : undefined;
      return `${lines.length} ${lines.length === 1 ? "line" : "lines"}`;
    }
    case "grep":
    case "find":
      return lines.length > 0 ? `${lines.length} matches` : "no matches";
    case "ls": {
      const entries = lines.length;
      return entries > 0 ? `${entries} entries` : undefined;
    }
    case "edit": {
      const d = details as
        | { added?: number; removed?: number; addedLines?: number; deletedLines?: number }
        | undefined;
      const added = d?.added ?? d?.addedLines;
      const removed = d?.removed ?? d?.deletedLines;
      if (typeof added === "number" && typeof removed === "number") return `+${added} -${removed}`;
      return "edited";
    }
    case "write":
      return "written";
    default: {
      // Generic fallback: first meaningful line of output, bounded.
      const head = lines[0];
      return head ? bound(head) : undefined;
    }
  }
}

/** `code · revision 7 · 8 calls · 3.4s` style line from pinx.exec metadata. */
export function summarizeExecDetails(details: PinxExecDetails): string {
  const parts: string[] = [];
  parts.push(details.runtime ?? "code");
  const revision = revisionPart(details);
  if (revision) parts.push(revision);
  if (typeof details.calls === "number")
    parts.push(`${details.calls} ${details.calls === 1 ? "call" : "calls"}`);
  if (details.jobId) parts.push(`job ${details.jobId}`);
  if (typeof details.durationMs === "number") parts.push(formatMs(details.durationMs));
  if (details.replay) parts.push("authorized replay");
  return parts.join(" · ");
}

function revisionPart(details: PinxExecDetails): string | undefined {
  if (typeof details.revision !== "number") return undefined;
  if (typeof details.repairedFrom === "number")
    return `revision ${details.revision} (repaired from ${details.repairedFrom})`;
  return `revision ${details.revision}`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

/** Bounded head preview for expanded (Level 2+) views. */
export function resultPreview(result: ToolResultLike | undefined, maxLines = 8): string[] {
  if (!result) return [];
  const text = firstText(result);
  if (!text) return [];
  return nonEmptyLines(text)
    .slice(0, maxLines)
    .map((l) => (l.length > MAX_PREVIEW_CHARS ? l.slice(0, MAX_PREVIEW_CHARS - 1) + "…" : l));
}
