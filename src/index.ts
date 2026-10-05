import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { ActivityTimeline } from "./timeline/timeline.ts";
import { summarizeToolResult } from "./render/result-summary.ts";
import { createToolRendererResolver } from "./render/tool-renderer.ts";
import { buildWidgetLines, type LatestContextStatus } from "./render/widget.ts";
import { renderOverviewCard } from "./render/overview.ts";

/**
 * pi-ui-next — experimental human-facing TUI enhancement layer.
 *
 * feat/nested-code-renderer + live status: tool renderers (fill-in policy),
 * an above-editor live widget (turn status + context pressure from the
 * pinx.context.status contract), and the /ui-next overview command.
 */

export default function piUiNext(pi: ExtensionAPI) {
  const timeline = new ActivityTimeline();
  let latestContext: LatestContextStatus | undefined;
  let latestActivity: string | undefined;
  let lastWidgetKey = "";

  // Contract events from producers (context-manager, recovery, exec). Absence
  // of producers degrades gracefully: the widget shows timeline data only.
  pi.events.on("pinx.context.status", (data) => {
    const payload = data as {
      v?: number;
      contextWindow?: number | null;
      usedTokens?: { value?: number; source?: string };
      activeEngine?: string;
      archivedRefs?: number;
      breakdown?: Array<{ label?: string; tokens?: number }>;
    };
    if (payload?.v !== 1) return;
    const reclaimable = payload.breakdown?.find((b) => b.label === "reclaimable");
    latestContext = {
      used:
        payload.usedTokens && typeof payload.usedTokens.value === "number"
          ? { value: payload.usedTokens.value, source: payload.usedTokens.source ?? "estimated" }
          : undefined,
      window: payload.contextWindow ?? undefined,
      engine: payload.activeEngine,
      archivedRefs: payload.archivedRefs,
      eligibleTokens: typeof reclaimable?.tokens === "number" ? reclaimable.tokens : undefined,
    };
  });
  pi.events.on("pinx.activity", (data) => {
    const payload = data as { v?: number; summary?: string };
    if (payload?.v === 1 && typeof payload.summary === "string") {
      latestActivity = payload.summary;
    }
  });

  pi.on("session_start", (_event, ctx) => {
    timeline.reset();
    latestActivity = undefined;
    renderWidget(ctx);
  });

  pi.on("turn_start", (event, ctx) => {
    timeline.beginTurn("user", event.timestamp);
    renderWidget(ctx);
  });

  pi.on("tool_execution_start", (event, ctx) => {
    timeline.startCall({
      toolCallId: event.toolCallId,
      parentToolCallId: event.parentToolCallId,
      toolName: event.toolName,
      args: event.args,
    });
    renderWidget(ctx);
  });

  pi.on("tool_execution_update", (event) => {
    const partial = event.partialResult;
    const text =
      typeof partial === "string"
        ? partial
        : typeof partial === "object" && partial !== null && "content" in partial
          ? JSON.stringify((partial as { content: unknown }).content)
          : undefined;
    timeline.updateCall(event.toolCallId, text);
  });

  pi.on("tool_execution_end", (event, ctx) => {
    timeline.endCall(event.toolCallId, {
      isError: event.isError,
      summary: summarizeToolResult(
        event.toolName,
        event.result as Parameters<typeof summarizeToolResult>[1],
      ),
    });
    renderWidget(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    renderWidget(ctx);
  });

  // Fill in rendering only where nothing else does; never clobber existing
  // renderers (see createToolRendererResolver policy).
  pi.registerToolRenderer(createToolRendererResolver());

  pi.registerCommand("ui-next", {
    description: "Show pi-ui-next activity overview; `off` hides the live widget",
    handler: async (args, ctx) => {
      if (args.trim() === "off") {
        lastWidgetKey = "";
        ctx.ui.setWidget("pinx-ui", undefined);
        await ctx.ui.notify("pi-ui-next widget hidden (timeline keeps running)", "info");
        return;
      }
      renderWidget(ctx);
      const theme = (ctx.ui as { theme?: Theme }).theme ?? defaultFallbackTheme();
      const cardLines = renderOverviewCard(timeline, latestContext, theme, 80);
      await ctx.ui.notify(cardLines.join("\n"), "info");
    },
  });

  function renderWidget(ctx: ExtensionContext | ExtensionCommandContext): void {
    if (ctx.mode !== "tui") return;
    const turn = timeline.latestTurn();
    if (!turn) {
      if (lastWidgetKey !== "") {
        lastWidgetKey = "";
        ctx.ui.setWidget("pinx-ui", undefined);
      }
      return;
    }
    const stateKey = widgetStateKey();
    if (stateKey === lastWidgetKey) return; // skip no-op repaints
    lastWidgetKey = stateKey;

    ctx.ui.setWidget(
      "pinx-ui",
      (tui, theme) => {
        const width = (tui as { terminal?: { width?: number } })?.terminal?.width || 100;
        const lines = buildWidgetLines(timeline, latestContext, latestActivity, theme, width);
        return new Text(lines.join("\n"), 0, 0);
      },
      { placement: "aboveEditor" },
    );
  }

  function widgetStateKey(): string {
    const turn = timeline.latestTurn();
    if (!turn) return "";
    return JSON.stringify({
      turnIndex: turn.index,
      running: turn.endedAt === undefined,
      calls: turn.calls.length,
      failures: timeline.failures().length,
      ctx: latestContext,
      act: latestActivity,
    });
  }
}

function defaultFallbackTheme(): Theme {
  return {
    fg: (_c: string, text: string) => text,
    bg: (_c: string, text: string) => text,
    style: (text: string) => text,
  } as unknown as Theme;
}
