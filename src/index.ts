import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STACK_INFO } from "./info.ts";
import { ActivityTimeline } from "./timeline/timeline.ts";
import { project } from "./timeline/project.ts";
import { summarizeToolResult } from "./render/result-summary.ts";
import { createToolRendererResolver } from "./render/tool-renderer.ts";

/**
 * pi-ui-next — experimental human-facing TUI enhancement layer.
 *
 * feat/activity-timeline: ingest real execution relationships
 * (tool_execution_*, parentToolCallId) into the ActivityTimeline and expose
 * the Level-0 overview. Transcript renderers land on later feature branches.
 */
export default function piUiNext(pi: ExtensionAPI) {
  const timeline = new ActivityTimeline();

  pi.on("session_start", () => {
    timeline.reset();
  });

  pi.on("turn_start", (event) => {
    timeline.beginTurn("user", event.timestamp);
  });

  pi.on("tool_execution_start", (event) => {
    timeline.startCall({
      toolCallId: event.toolCallId,
      parentToolCallId: event.parentToolCallId,
      toolName: event.toolName,
      args: event.args,
    });
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

  pi.on("tool_execution_end", (event) => {
    timeline.endCall(event.toolCallId, {
      isError: event.isError,
      summary: summarizeToolResult(
        event.toolName,
        event.result as Parameters<typeof summarizeToolResult>[1],
      ),
    });
  });

  // Fill in rendering only where nothing else does; never clobber existing
  // renderers (see createToolRendererResolver policy).
  pi.registerToolRenderer(createToolRendererResolver());

  pi.registerCommand("ui-next", {
    description: "Show pi-ui-next activity overview",
    handler: async (_args, ctx) => {
      const lines = project(timeline, { width: 100, icons: "unicode" });
      const failed = timeline.failures().length;
      const head = `pi-ui-next ${STACK_INFO.contractVersion} · ${timeline.turnsList().length} turns · ${failed} failed calls`;
      await ctx.ui.notify(head + (lines.length > 0 ? `\n${lines.join("\n")}` : ""), "info");
    },
  });
}
