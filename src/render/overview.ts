// Overview card for /ui-next command.
// Composes Box/VStack components into a framed overview card (rounded borders)
// with sections: Turn 概览 / 失败 / 证据引用.
// Aligned with padEndToWidth and bounded with truncateToWidth (U4).

import { Box, VStack, Text, type Component } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { STACK_INFO } from "../info.ts";
import { projectTurn } from "../timeline/project.ts";
import type { ActivityTimeline } from "../timeline/timeline.ts";
import { formatK, type LatestContextStatus } from "./widget.ts";
import { renderDim, renderStatusIcon } from "./themed.ts";
import { padEndToWidth, truncateToWidth, visibleWidth } from "./width.ts";

const MIN_CARD_WIDTH = 50;
const DEFAULT_CARD_WIDTH = 80;

/** Render the framed overview card as an array of terminal lines. */
export function renderOverviewCard(
  timeline: ActivityTimeline,
  latestContext: LatestContextStatus | undefined,
  theme: Theme,
  width = DEFAULT_CARD_WIDTH,
): string[] {
  const cardWidth = Math.max(MIN_CARD_WIDTH, width);
  const innerWidth = cardWidth - 4; // 2 cols for "│ " and 2 cols for " │"

  const turns = timeline.turnsList();
  const failures = timeline.failures();
  const failedCount = failures.length;

  const headerTitle = `pi-ui-next ${STACK_INFO.contractVersion} · ${turns.length} ${turns.length === 1 ? "turn" : "turns"} · ${failedCount} ${failedCount === 1 ? "failure" : "failures"}`;

  const lines: string[] = [];

  // Top border: ╭─ Title ──────╮
  lines.push(buildTopBorder(headerTitle, cardWidth, theme));

  // --- Section 1: Turn 概览 ---
  if (turns.length === 0) {
    lines.push(buildCardLine(renderDim(theme, "No activity in session"), innerWidth, theme));
  } else {
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]!;
      const turnHead = `Turn ${turn.index} (${turn.calls.length} ${turn.calls.length === 1 ? "call" : "calls"})`;
      lines.push(buildCardLine(turnHead, innerWidth, theme));
      const projected = projectTurn(turn, (id) => timeline.childrenOf(id), {
        width: innerWidth - 2,
        icons: "unicode",
      });
      for (const pLine of projected) {
        if (pLine.trim().length > 0) {
          lines.push(buildCardLine(`  ${pLine}`, innerWidth, theme));
        }
      }
      if (i < turns.length - 1) {
        lines.push(buildCardLine("", innerWidth, theme));
      }
    }
  }

  // --- Section 2: 失败 ---
  const failTitle = `Failures (${failedCount})`;
  lines.push(buildDividerBorder(failTitle, cardWidth, theme));
  if (failedCount === 0) {
    lines.push(buildCardLine(renderDim(theme, "No failures recorded"), innerWidth, theme));
  } else {
    for (const fail of failures) {
      const icon = renderStatusIcon(theme, "failure", "✗");
      const desc =
        fail.title && fail.summary && fail.title !== fail.summary
          ? `${fail.title} · ${fail.summary}`
          : fail.title || fail.summary || "failed";
      const line = `  ${icon} ${fail.toolName}: ${desc}`;
      lines.push(buildCardLine(line, innerWidth, theme));
    }
  }

  // --- Section 3: 证据引用 ---
  lines.push(buildDividerBorder("Evidence References", cardWidth, theme));
  if (latestContext && latestContext.archivedRefs !== undefined && latestContext.archivedRefs > 0) {
    const engine = latestContext.engine ?? "generic-verified";
    lines.push(
      buildCardLine(
        `  ${latestContext.archivedRefs} evidence refs archived (${engine})`,
        innerWidth,
        theme,
      ),
    );
    if (latestContext.eligibleTokens !== undefined) {
      lines.push(
        buildCardLine(
          `  reclaimable ~${formatK(latestContext.eligibleTokens)} tokens`,
          innerWidth,
          theme,
        ),
      );
    }
  } else {
    lines.push(
      buildCardLine(renderDim(theme, "No evidence references in session"), innerWidth, theme),
    );
  }

  // Bottom border: ╰────────╯
  lines.push(buildBottomBorder(cardWidth, theme));

  return lines;
}

/** Construct a Box / VStack component tree representing the overview card. */
export function createOverviewComponent(
  timeline: ActivityTimeline,
  latestContext: LatestContextStatus | undefined,
  theme: Theme,
  width = DEFAULT_CARD_WIDTH,
): Component {
  const cardLines = renderOverviewCard(timeline, latestContext, theme, width);
  const vstack = new VStack();
  for (const line of cardLines) {
    vstack.addChild(new Text(line, 0, 0));
  }
  const box = new Box(0, 0);
  box.addChild(vstack);
  return box;
}

function buildTopBorder(title: string, width: number, theme: Theme): string {
  const t = truncateToWidth(title, width - 6);
  const remaining = Math.max(0, width - 4 - visibleWidth(t) - 1);
  const borderChar = "─";
  const left = theme.fg("border", `╭─ `);
  const right = theme.fg("border", ` ${borderChar.repeat(remaining)}╮`);
  return `${left}${t}${right}`;
}

function buildDividerBorder(section: string, width: number, theme: Theme): string {
  const s = truncateToWidth(section, width - 6);
  const remaining = Math.max(0, width - 4 - visibleWidth(s) - 1);
  const borderChar = "─";
  const left = theme.fg("border", `├─ `);
  const right = theme.fg("border", ` ${borderChar.repeat(remaining)}┤`);
  return `${left}${s}${right}`;
}

function buildBottomBorder(width: number, theme: Theme): string {
  const borderChar = "─";
  const body = borderChar.repeat(Math.max(0, width - 2));
  return theme.fg("border", `╰${body}╯`);
}

function buildCardLine(content: string, innerWidth: number, theme: Theme): string {
  const truncated = truncateToWidth(content, innerWidth);
  const padded = padEndToWidth(truncated, innerWidth);
  const borderLeft = theme.fg("border", "│");
  const borderRight = theme.fg("border", "│");
  return `${borderLeft} ${padded} ${borderRight}`;
}
