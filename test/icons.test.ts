import { test } from "node:test";
import assert from "node:assert/strict";
import { ICONS, type IconMode, type IconSet } from "../src/render/icons.ts";
import { ActivityTimeline } from "../src/timeline/timeline.ts";
import { project } from "../src/timeline/project.ts";
import { visibleWidth } from "../src/render/width.ts";

const MODES: IconMode[] = ["unicode", "ascii", "nerd"];

test("[U3] all icon sets define non-empty strings for all semantic roles", () => {
  const requiredKeys: Array<keyof IconSet> = [
    "running",
    "success",
    "failure",
    "cancelled",
    "warning",
    "branch",
    "lastBranch",
    "vertical",
    "expanded",
    "collapsed",
  ];

  for (const mode of MODES) {
    const set = ICONS[mode];
    assert.ok(set, `missing icon set for mode ${mode}`);
    for (const key of requiredKeys) {
      assert.ok(typeof set[key] === "string" && set[key].length > 0, `${mode}.${key} is missing`);
    }
  }
});

test("[U3] nerd icon mode renders harmonized Nerd Font icons in projection (U3, U5)", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "c1", toolName: "read", args: { path: "src/index.ts" }, ts: 1000 });
  t.endCall("c1", { isError: false, summary: "3 lines", ts: 1100 });
  t.startCall({ toolCallId: "c2", toolName: "bash", args: { command: "false" }, ts: 1200 });
  t.endCall("c2", { isError: true, summary: "exit 1", ts: 1300 });
  t.endTurn(2000);

  const lines = project(t, { width: 80, icons: "nerd", now: 2000 });

  // Header should use nerd success icon (󰄳)
  assert.ok(lines[0]!.includes(ICONS.nerd.success), lines[0]);
  assert.ok(lines[0]!.includes("Done"), lines[0]);

  // Read call row should use nerd success icon (󰄳)
  assert.ok(lines[2]!.includes(ICONS.nerd.success), lines[2]);
  assert.ok(lines[2]!.includes("read"), lines[2]);

  // Bash call row should use nerd failure icon (󰅚)
  assert.ok(lines[3]!.includes(ICONS.nerd.failure), lines[3]);
  assert.ok(lines[3]!.includes("bash"), lines[3]);

  // Visible width check
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 80, `visibleWidth was ${visibleWidth(line)}: "${line}"`);
  }
});

test("[U3] nerd icon mode renders running icon for active turn", () => {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "c1", toolName: "bash", args: { command: "sleep 10" }, ts: 1000 });

  const lines = project(t, { width: 80, icons: "nerd", now: 5000 });

  // Turn header should use nerd running icon (󰪥)
  assert.ok(lines[0]!.includes(ICONS.nerd.running), lines[0]);
  assert.ok(lines[0]!.includes("Working"), lines[0]);

  // Running call should use nerd running icon (󰪥)
  assert.ok(lines[2]!.includes(ICONS.nerd.running), lines[2]);
});
