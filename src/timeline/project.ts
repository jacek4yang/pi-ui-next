// Timeline projection: Level 0 (conversation overview, default) and
// Level 1 (expanded activity). Output is plain text lines bounded to the
// requested visible width; ANSI/theme colors are applied by the TUI layer,
// never embedded here, so goldens stay deterministic.

import { ICONS, type IconMode, type IconSet } from "../render/icons.ts";
import { padEndToWidth, truncateToWidth, visibleWidth } from "../render/width.ts";
import type { ActivityTimeline } from "./timeline.ts";
import type { TimelineCall, TurnGroup } from "./types.ts";

export interface ProjectOptions {
  /** Terminal width in visible columns (80/120/160 goldens). */
  width: number;
  icons: IconMode;
  /** Tool call ids rendered at Level 1 (children listed). Default: collapsed. */
  expanded?: ReadonlySet<string>;
  /** Wall clock used for elapsed durations of running work. */
  now?: number;
  /** Hard cap on returned lines (bounded output). */
  maxLines?: number;
}

const NAME_COLUMN_MIN = 8;
const NAME_COLUMN_MAX = 16;

export function projectTurn(
  turn: TurnGroup,
  childrenOf: (toolCallId: string) => TimelineCall[],
  opts: ProjectOptions,
): string[] {
  const icons = ICONS[opts.icons];
  const now = opts.now ?? turn.endedAt;
  const lines: string[] = [];
  const max = opts.maxLines;
  const push = (line: string): boolean => {
    lines.push(truncateToWidth(line, Math.max(1, opts.width)));
    return max === undefined || lines.length < max;
  };

  const running = turn.endedAt === undefined;
  const durationMs = turnDuration(turn, childrenOf, now);
  const header = running
    ? `${icons.running} Working${durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : ""}`
    : `${icons.success} Done${durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : ""}`;
  if (!push(header)) return lines;
  if (!push("")) return lines;

  const nameWidth = nameColumnWidth(turn, childrenOf);
  const roots = turn.calls;
  for (let i = 0; i < roots.length; i++) {
    const isLast = i === roots.length - 1;
    if (!emitCall(roots[i]!, "", isLast, childrenOf, opts, icons, nameWidth, push, 0)) return lines;
  }
  return lines;
}

export function project(timeline: ActivityTimeline, opts: ProjectOptions): string[] {
  const turn = timeline.latestTurn();
  if (!turn) return [];
  return projectTurn(turn, (id) => timeline.childrenOf(id), opts);
}

export function projectAll(timeline: ActivityTimeline, opts: ProjectOptions): string[] {
  const out: string[] = [];
  for (const turn of timeline.turnsList()) {
    for (const line of projectTurn(turn, (id) => timeline.childrenOf(id), opts)) out.push(line);
    out.push("");
  }
  return out;
}

type Push = (line: string) => boolean;
type ChildrenOf = (toolCallId: string) => TimelineCall[];

function emitCall(
  call: TimelineCall,
  indent: string,
  isLast: boolean,
  childrenOf: ChildrenOf,
  opts: ProjectOptions,
  icons: IconSet,
  nameWidth: number,
  push: Push,
  depth: number,
): boolean {
  const children = childrenOf(call.toolCallId);
  const expanded = (opts.expanded?.has(call.toolCallId) ?? false) && children.length > 0;
  const branch =
    depth === 0
      ? isLast
        ? icons.lastBranch
        : icons.branch
      : isLast
        ? icons.lastBranch
        : icons.branch;
  const icon = statusIcon(call.status, icons, hasFailedDescendant(call, childrenOf));
  const name = padEndToWidth(call.toolName, nameWidth);
  const summary = nodeSummary(call, childrenOf, opts);
  const head = `${indent}${branch} ${icon} ${name}`;
  const line = summary ? `${head} ${summary}` : head.replace(/\s+$/, "");
  if (!push(line)) return false;

  if (!expanded) return true;
  const childIndent = `${indent}${isLast ? "  " : `${icons.vertical}  `}`;
  for (let i = 0; i < children.length; i++) {
    if (
      !emitCall(
        children[i]!,
        childIndent,
        i === children.length - 1,
        childrenOf,
        opts,
        icons,
        nameWidth,
        push,
        depth + 1,
      )
    ) {
      return false;
    }
  }
  return true;
}

function statusIcon(status: TimelineCall["status"], icons: IconSet, failedKids: boolean): string {
  switch (status) {
    case "running":
      return icons.running;
    case "success":
      return failedKids ? icons.warning : icons.success;
    case "failure":
      return icons.failure;
    case "cancelled":
      return icons.cancelled;
  }
}

function nodeSummary(call: TimelineCall, childrenOf: ChildrenOf, opts: ProjectOptions): string {
  const children = childrenOf(call.toolCallId);
  const fragments: string[] = [];
  if (children.length > 0) {
    fragments.push(`${children.length} ${children.length === 1 ? "call" : "calls"}`);
    const own = callDuration(call, opts.now);
    if (own !== undefined) fragments.push(formatDuration(own));
  } else {
    const outcome = call.summary ?? call.title;
    if (outcome) fragments.push(outcome);
    else if (call.status === "running") fragments.push("…");
  }
  const failedKids = countFailed(call, childrenOf);
  if (call.status === "success" && failedKids > 0) {
    fragments.push(`${failedKids} failed`);
  }
  return fragments.join(" · ");
}

function hasFailedDescendant(call: TimelineCall, childrenOf: ChildrenOf): boolean {
  return countFailed(call, childrenOf) > 0;
}

function countFailed(call: TimelineCall, childrenOf: ChildrenOf): number {
  let n = 0;
  for (const child of childrenOf(call.toolCallId)) {
    if (child.status === "failure") n++;
    n += countFailed(child, childrenOf);
  }
  return n;
}

function nameColumnWidth(turn: TurnGroup, childrenOf: ChildrenOf): number {
  let widest = NAME_COLUMN_MIN;
  const visit = (call: TimelineCall): void => {
    const w = Math.min(NAME_COLUMN_MAX, visibleWidth(call.toolName));
    if (w > widest) widest = w;
    for (const child of childrenOf(call.toolCallId)) visit(child);
  };
  for (const call of turn.calls) visit(call);
  return widest;
}

function callDuration(call: TimelineCall, now?: number): number | undefined {
  const start = call.startedAt;
  if (start === undefined) return undefined;
  const end = call.endedAt ?? now;
  if (end === undefined) return undefined;
  return Math.max(0, end - start);
}

function turnDuration(
  turn: TurnGroup,
  childrenOf: ChildrenOf,
  now: number | undefined,
): number | undefined {
  const start = turn.startedAt ?? earliestStart(turn, childrenOf);
  if (start === undefined) return undefined;
  const end = turn.endedAt ?? now;
  if (end === undefined) return undefined;
  return Math.max(0, end - start);
}

function earliestStart(turn: TurnGroup, childrenOf: ChildrenOf): number | undefined {
  let min: number | undefined;
  const visit = (call: TimelineCall): void => {
    if (call.startedAt !== undefined && (min === undefined || call.startedAt < min))
      min = call.startedAt;
    for (const child of childrenOf(call.toolCallId)) visit(child);
  };
  for (const call of turn.calls) visit(call);
  return min;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}
