// [U6] Estimated and provider-reported figures must always be labeled
// distinctly in the live widget's context line. Tests drive the real
// buildWidgetLines with a stubbed theme that strips ANSI, so the labels
// themselves are what's asserted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ActivityTimeline } from "../src/timeline/timeline.ts";
import { buildWidgetLines } from "../src/render/widget.ts";
import type { Theme } from "@earendil-works/pi-coding-agent";

const stubTheme = {
  fg: (_token: string, text: string) => text,
  style: (text: string) => text,
  bg: (_token: string, text: string) => text,
} as unknown as Theme;

function timelineWithTurn(): ActivityTimeline {
  const t = new ActivityTimeline();
  t.beginTurn("user", 1000);
  t.startCall({ toolCallId: "a", toolName: "bash", args: { command: "ls" }, ts: 1100 });
  t.endCall("a", { isError: false, ts: 1200 });
  t.endTurn(2000);
  return t;
}

test("[U6] provider-reported context usage is labeled as such", () => {
  const lines = buildWidgetLines(
    timelineWithTurn(),
    {
      used: { value: 114000, source: "provider-reported" },
      window: 272000,
      engine: undefined,
      archivedRefs: undefined,
      eligibleTokens: undefined,
    },
    undefined,
    stubTheme,
    120,
    3000,
  );
  const ctxLine = lines.find((l) => l.includes("█") || l.includes("░") || l.includes("ctx"));
  assert.ok(ctxLine, `no context line in: ${lines.join(" | ")}`);
  assert.match(ctxLine!, /\(provider-reported\)/);
});

test("[U6] estimated figures are labeled estimated, never provider-reported", () => {
  const lines = buildWidgetLines(
    timelineWithTurn(),
    {
      used: { value: 50000, source: "estimated" },
      window: 272000,
      engine: undefined,
      archivedRefs: undefined,
      eligibleTokens: undefined,
    },
    undefined,
    stubTheme,
    120,
    3000,
  );
  const ctxLine = lines.find((l) => l.includes("█") || l.includes("░") || l.includes("ctx"));
  assert.ok(ctxLine);
  assert.match(ctxLine!, /\(estimated\)/);
  assert.doesNotMatch(ctxLine!, /provider-reported/);
});

test("[U6] an unknown source can never masquerade as provider-reported", () => {
  const lines = buildWidgetLines(
    timelineWithTurn(),
    {
      used: { value: 1000, source: "mystery" },
      window: 8000,
      engine: undefined,
      archivedRefs: undefined,
      eligibleTokens: undefined,
    },
    undefined,
    stubTheme,
    120,
    3000,
  );
  const ctxLine = lines.find((l) => l.includes("█") || l.includes("░") || l.includes("ctx"));
  assert.ok(ctxLine);
  assert.match(ctxLine!, /\(mystery\)/);
  assert.doesNotMatch(ctxLine!, /provider-reported|estimated/);
});
