// Themed live widget presentation for pi-ui-next (aboveEditor).
// Renders 3-5 line compact panel:
// Line 1: Status icon + turn status + call count + failed count (warning token)
// Line 2: Context pressure (mini progress bar + token stats + reclaimable)
// Line 3: Recent activity (accent token)
// Every line truncated to terminal width (U4).

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ActivityTimeline } from "../timeline/timeline.ts";
import { formatDuration } from "../timeline/project.ts";
import {
  renderAccent,
  renderDim,
  renderMuted,
  renderProgressBar,
  renderStatusIcon,
  renderWarning,
} from "./themed.ts";
import { truncateToWidth } from "./width.ts";

export interface LatestContextStatus {
  used: { value: number; source: string } | undefined;
  window: number | undefined;
  engine: string | undefined;
  archivedRefs: number | undefined;
  eligibleTokens: number | undefined;
}

export function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Construct themed 3-5 lines for the live widget. */
export function buildWidgetLines(
  timeline: ActivityTimeline,
  latestContext: LatestContextStatus | undefined,
  latestActivity: string | undefined,
  theme: Theme,
  width = 100,
  now?: number,
): string[] {
  const turn = timeline.latestTurn();
  if (!turn) return [];

  const lines: string[] = [];

  // --- Line 1: Status Line ---
  const running = turn.endedAt === undefined;
  const wallNow = now ?? Date.now();
  const startTime = turn.startedAt;
  const elapsedMs =
    startTime !== undefined ? Math.max(0, (turn.endedAt ?? wallNow) - startTime) : undefined;

  let icon: string;
  let statusWord: string;
  if (running) {
    icon = renderStatusIcon(theme, "running", "●");
    statusWord = elapsedMs !== undefined ? `Working · ${formatDuration(elapsedMs)}` : "Working";
  } else {
    icon = renderStatusIcon(theme, "success", "✓");
    statusWord = elapsedMs !== undefined ? `Done · ${formatDuration(elapsedMs)}` : "Done";
  }

  const rootCount = turn.calls.length;
  const callsPart = `${rootCount} ${rootCount === 1 ? "call" : "calls"}`;
  const failed = timeline.failures().length;

  let line1 = `${icon} ${statusWord} ${renderMuted(theme, `· ${callsPart}`)}`;
  if (failed > 0) {
    line1 += ` ${renderMuted(theme, "·")} ${renderWarning(theme, `${failed} failed`)}`;
  }
  lines.push(truncateToWidth(line1, width));

  // --- Line 2: Context Pressure Line (when contract event received) ---
  if (latestContext) {
    const used = latestContext.used;
    const window = latestContext.window;
    const parts: string[] = [];

    if (used && window && window > 0) {
      const ratio = used.value / window;
      const bar = renderProgressBar(theme, ratio, 10);
      const usageDetail = renderMuted(
        theme,
        `· ${formatK(used.value)}/${formatK(window)} (${used.source})`,
      );
      parts.push(`${bar} ${usageDetail}`);
    } else if (used) {
      parts.push(renderMuted(theme, `ctx ~${formatK(used.value)} tokens (${used.source})`));
    }

    if (latestContext.eligibleTokens !== undefined) {
      parts.push(renderMuted(theme, `reclaimable ~${formatK(latestContext.eligibleTokens)}`));
    }

    if (latestContext.archivedRefs !== undefined && latestContext.archivedRefs > 0) {
      parts.push(renderMuted(theme, `${latestContext.archivedRefs} evidence refs`));
    }

    if (latestContext.engine) {
      parts.push(renderDim(theme, `engine ${latestContext.engine}`));
    }

    if (parts.length > 0) {
      const line2 = parts.join(` ${renderMuted(theme, "·")} `);
      lines.push(truncateToWidth(line2, width));
    }
  }

  // --- Line 3: Recent Activity (accent colored) ---
  if (latestActivity) {
    const line3 = renderAccent(theme, latestActivity);
    lines.push(truncateToWidth(line3, width));
  }

  return lines;
}
