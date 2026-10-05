import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { STACK_INFO } from "./info.ts";
import { ActivityTimeline } from "./timeline/timeline.ts";
import { project } from "./timeline/project.ts";
import { summarizeToolResult } from "./render/result-summary.ts";
import { createToolRendererResolver } from "./render/tool-renderer.ts";

/**
 * pi-ui-next — experimental human-facing TUI enhancement layer.
 *
 * feat/nested-code-renderer + live status: tool renderers (fill-in policy),
 * an above-editor live widget (turn status + context pressure from the
 * pinx.context.status contract), and the /ui-next overview command.
 */

interface LatestContextStatus {
  used: { value: number; source: string } | undefined;
  window: number | undefined;
  engine: string | undefined;
  archivedRefs: number | undefined;
  eligibleTokens: number | undefined;
}

export default function piUiNext(pi: ExtensionAPI) {
  const timeline = new ActivityTimeline();
  let latestContext: LatestContextStatus | undefined;
  let latestActivity: string | undefined;
  let lastWidgetLines: string[] = [];

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
        ctx.ui.setWidget("pinx-ui", undefined);
        await ctx.ui.notify("pi-ui-next widget hidden (timeline keeps running)", "info");
        return;
      }
      renderWidget(ctx);
      const lines = project(timeline, { width: 100, icons: "unicode" });
      const failed = timeline.failures().length;
      const head = `pi-ui-next ${STACK_INFO.contractVersion} · ${timeline.turnsList().length} turns · ${failed} failed calls`;
      await ctx.ui.notify(head + (lines.length > 0 ? `\n${lines.join("\n")}` : ""), "info");
    },
  });

  function renderWidget(ctx: ExtensionContext | ExtensionCommandContext): void {
    if (ctx.mode !== "tui") return;
    const lines = widgetLines();
    if (lines.length === 0) return;
    if (lines.join("\n") === lastWidgetLines.join("\n")) return; // skip no-op repaints
    lastWidgetLines = lines;
    ctx.ui.setWidget("pinx-ui", lines, { placement: "aboveEditor" });
  }

  function widgetLines(): string[] {
    const turn = timeline.latestTurn();
    if (!turn) return [];
    const now = Date.now();
    const header =
      project(timeline, { width: 120, icons: "unicode", now, maxLines: 1 })[0] ?? "idle";
    const rootCount = turn.calls.length;
    const failed = timeline.failures().length;
    const line1 = `${header} · ${rootCount} ${rootCount === 1 ? "call" : "calls"}${failed > 0 ? ` · ${failed} failed` : ""}`;
    const lines = [line1];
    if (latestContext) {
      const used = latestContext.used;
      const window = latestContext.window;
      const parts: string[] = [];
      if (used && window) {
        parts.push(
          `ctx ${Math.min(100, Math.round((used.value / window) * 100))}% · ${formatK(used.value)}/${formatK(window)} (${used.source})`,
        );
      } else if (used) {
        parts.push(`ctx ~${formatK(used.value)} tokens (${used.source})`);
      }
      if (latestContext.eligibleTokens !== undefined) {
        parts.push(`reclaimable ~${formatK(latestContext.eligibleTokens)}`);
      }
      if (latestContext.archivedRefs !== undefined && latestContext.archivedRefs > 0) {
        parts.push(`${latestContext.archivedRefs} evidence refs`);
      }
      if (latestContext.engine) parts.push(`engine ${latestContext.engine}`);
      if (parts.length > 0) lines.push(parts.join(" · "));
    }
    if (latestActivity) lines.push(latestActivity);
    return lines;
  }

  function formatK(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }
}
