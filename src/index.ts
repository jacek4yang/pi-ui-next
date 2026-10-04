import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STACK_INFO } from "./info.ts";

/**
 * pi-ui-next — experimental human-facing TUI enhancement layer.
 *
 * Bootstrap entry (main): registers the status command only. The activity
 * timeline, tool renderers, and theme system land on feature branches
 * (feat/activity-timeline, feat/nested-code-renderer, ...).
 */
export default function piUiNext(pi: ExtensionAPI) {
  pi.registerCommand("ui-next", {
    description: "Show pi-ui-next stack status",
    handler: async (_args, ctx) => {
      await ctx.ui.notify(
        "pi-ui-next " +
          STACK_INFO.contractVersion +
          ": bootstrap (renderers land on feature branches)",
        "info",
      );
    },
  });
}
