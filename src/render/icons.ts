// Icon sets. Icon mode is presentation; semantic meaning of each role is
// fixed (U3 in docs/INVARIANTS.md): a theme or icon pack may never swap the
// meaning of running/success/failure/cancelled/warning.

export type IconMode = "unicode" | "ascii" | "nerd";

export interface IconSet {
  running: string;
  success: string;
  failure: string;
  cancelled: string;
  warning: string;
  branch: string;
  lastBranch: string;
  vertical: string;
  expanded: string;
  collapsed: string;
}

export const ICONS: Record<IconMode, IconSet> = {
  unicode: {
    running: "●",
    success: "✓",
    failure: "✗",
    cancelled: "⊘",
    warning: "⚠",
    branch: "├─",
    lastBranch: "└─",
    vertical: "│",
    expanded: "▼",
    collapsed: "▶",
  },
  ascii: {
    running: "*",
    success: "+",
    failure: "x",
    cancelled: "o",
    warning: "!",
    branch: "|",
    lastBranch: "\\",
    vertical: "|",
    expanded: "v",
    collapsed: ">",
  },
  nerd: {
    running: "󰪥",
    success: "󰄳",
    failure: "󰅚",
    cancelled: "󰅙",
    warning: "󰀦",
    branch: "├─",
    lastBranch: "└─",
    vertical: "│",
    expanded: "󰅀",
    collapsed: "󰅂",
  },
};
