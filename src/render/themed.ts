// Themed rendering primitives for pi-ui-next.
// Pure functions accepting Theme instances: semantic coloring, truncation,
// progress bar, and badge formatting.
// Conforms to U3 (themes never change semantic meaning) and U4 (CJK width-safe).

import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { formatMs } from "./result-summary.ts";
import { truncateToWidth, visibleWidth } from "./width.ts";

export type StatusRole = "success" | "failure" | "warning" | "running" | "cancelled";

/** Theme-colored status icon according to U3 semantic rules. */
export function renderStatusIcon(theme: Theme, status: StatusRole, icon: string): string {
  switch (status) {
    case "success":
      return theme.fg("success", icon);
    case "failure":
      return theme.fg("error", icon);
    case "warning":
      return theme.fg("warning", icon);
    case "running":
      return theme.fg("accent", icon);
    case "cancelled":
      return theme.fg("muted", icon);
  }
}

/** Tool name with primary emphasis (`toolTitle`). */
export function renderToolTitle(theme: Theme, name: string): string {
  return theme.fg("toolTitle", name);
}

/** Metadata / secondary text weakened with `muted`. */
export function renderMuted(theme: Theme, text: string): string {
  return theme.fg("muted", text);
}

/** Dim text for low-priority hints or borders. */
export function renderDim(theme: Theme, text: string): string {
  return theme.fg("dim", text);
}

/** Highlighted text using `accent`. */
export function renderAccent(theme: Theme, text: string): string {
  return theme.fg("accent", text);
}

/** Error message / indicator using `error`. */
export function renderError(theme: Theme, text: string): string {
  return theme.fg("error", text);
}

/** Warning message / indicator using `warning`. */
export function renderWarning(theme: Theme, text: string): string {
  return theme.fg("warning", text);
}

/** Success message / indicator using `success`. */
export function renderSuccess(theme: Theme, text: string): string {
  return theme.fg("success", text);
}

/** Standard separator dot with `muted` style. */
export function renderSeparator(theme: Theme, sep = "·"): string {
  return theme.fg("muted", sep);
}

/** Format diff summary `+added -removed` with diff semantic tokens. */
export function renderDiffStat(theme: Theme, added: number, removed: number): string {
  return `${theme.fg("toolDiffAdded", `+${added}`)} ${theme.fg("toolDiffRemoved", `-${removed}`)}`;
}

/** Format single line of diff or patch with diff semantic tokens. */
export function renderDiffLine(theme: Theme, line: string): string {
  if (line.startsWith("+")) {
    return theme.fg("toolDiffAdded", line);
  }
  if (line.startsWith("-")) {
    return theme.fg("toolDiffRemoved", line);
  }
  if (line.startsWith("@@")) {
    return theme.fg("toolDiffContext", line);
  }
  return theme.fg("toolOutput", line);
}

/**
 * 10-block mini pressure bar (`█████░░░░░ 42%`) with 3 threshold tiers:
 * - < 50%: success
 * - 50% ~ 79%: warning
 * - >= 80%: error
 */
export function renderProgressBar(theme: Theme, ratio: number, totalBlocks = 10): string {
  const clampedRatio = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const percent = Math.round(clampedRatio * 100);
  const usedBlocks = Math.max(0, Math.min(totalBlocks, Math.round(clampedRatio * totalBlocks)));
  const emptyBlocks = totalBlocks - usedBlocks;
  const barText = "█".repeat(usedBlocks) + "░".repeat(emptyBlocks);

  let token: ThemeColor;
  if (percent < 50) {
    token = "success";
  } else if (percent < 80) {
    token = "warning";
  } else {
    token = "error";
  }

  const coloredBar = theme.fg(token, barText);
  const coloredPercent = theme.fg(token, `${percent}%`);
  return `${coloredBar} ${coloredPercent}`;
}

/**
 * Middle-path truncation: e.g. `src/…/deep/file.ts`.
 * Preserves the path start and terminal file name within `maxWidth`.
 * CJK and ANSI safe via visibleWidth and truncateToWidth.
 */
export function truncateMiddlePath(path: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (visibleWidth(path) <= maxWidth) return path;
  if (maxWidth <= 3) return truncateToWidth(path, maxWidth);

  const sep = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[/\\]/);

  if (parts.length >= 3) {
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    const candidate = `${first}${sep}…${sep}${last}`;
    if (visibleWidth(candidate) <= maxWidth) {
      // Try adding more segments from the tail if space allows
      let tailIndex = parts.length - 2;
      let currentTail = last;
      while (tailIndex > 1) {
        const nextTail = `${parts[tailIndex]!}${sep}${currentTail}`;
        const expanded = `${first}${sep}…${sep}${nextTail}`;
        if (visibleWidth(expanded) <= maxWidth) {
          currentTail = nextTail;
          tailIndex--;
        } else {
          break;
        }
      }
      return `${first}${sep}…${sep}${currentTail}`;
    }
  }

  // Character-based middle truncation fallback
  const ellipsis = "…";
  const avail = maxWidth - 1; // space for ellipsis
  const headCols = Math.ceil(avail / 2);
  const tailCols = avail - headCols;

  const head = truncateToWidth(path, headCols);
  // Find tail by trimming characters from front until tail fits in tailCols
  let tailStart = path.length;
  while (tailStart > 0) {
    const slice = path.slice(tailStart - 1);
    if (visibleWidth(slice) > tailCols) break;
    tailStart--;
  }
  const tail = path.slice(tailStart);
  return `${head}${ellipsis}${tail}`;
}

/** Single-line command collapsed and truncated to `maxWidth` (default 48). */
export function collapseCommand(command: string, maxWidth = 48): string {
  const oneLine = command
    .replace(/\\\r?\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (visibleWidth(oneLine) <= maxWidth) return oneLine;
  return `${truncateToWidth(oneLine, maxWidth - 1)}…`;
}

/**
 * Standard footer badge: `— node · 0.1s · exit 0`
 * All parts default to muted color; non-zero exit code emphasized in error color (U6).
 */
export function formatFooterBadge(
  theme: Theme,
  runtime: string,
  durationMs?: number,
  exitCode?: number,
): string {
  const parts: string[] = [`— ${runtime}`];
  if (typeof durationMs === "number") {
    parts.push(formatMs(durationMs));
  }
  if (typeof exitCode === "number") {
    if (exitCode === 0) {
      parts.push(`exit 0`);
    } else {
      // Non-zero exit code rendered with error token
      const prefix = theme.fg("muted", parts.join(" · ") + " · ");
      const exitBadge = theme.fg("error", `exit ${exitCode}`);
      return `${prefix}${exitBadge}`;
    }
  }
  return theme.fg("muted", parts.join(" · "));
}
