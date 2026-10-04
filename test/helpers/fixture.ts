import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ActivityTimeline } from "../../src/timeline/timeline.ts";

export interface FixtureCall {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  ts?: number;
  endTs?: number;
  isError?: boolean;
  summary?: string;
  preview?: string;
  children?: FixtureCall[];
}

export interface Fixture {
  /** Wall clock for projecting running turns. */
  now?: number;
  turns: Array<{
    source: "user" | "steering" | "system" | "session";
    startedAt?: number;
    endedAt?: number;
    calls: FixtureCall[];
  }>;
}

export interface LoadedFixture {
  timeline: ActivityTimeline;
  now: number | undefined;
}

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "goldens");

export function loadFixture(name: string): LoadedFixture {
  const fixture = JSON.parse(
    readFileSync(join(GOLDEN_DIR, "fixtures", `${name}.json`), "utf8"),
  ) as Fixture;
  const timeline = new ActivityTimeline();
  const walk = (calls: FixtureCall[], parent?: string): void => {
    for (const call of calls) {
      timeline.startCall({
        toolCallId: call.toolCallId,
        parentToolCallId: parent,
        toolName: call.toolName,
        args: call.args,
        ts: call.ts,
      });
      if (call.preview !== undefined) timeline.updateCall(call.toolCallId, call.preview);
      if (call.children) walk(call.children, call.toolCallId);
      if (call.endTs !== undefined || call.isError !== undefined) {
        timeline.endCall(call.toolCallId, {
          isError: call.isError ?? false,
          summary: call.summary,
          ts: call.endTs,
        });
      }
    }
  };
  for (const turn of fixture.turns) {
    timeline.beginTurn(turn.source, turn.startedAt);
    walk(turn.calls);
    if (turn.endedAt !== undefined) timeline.endTurn(turn.endedAt);
  }
  return { timeline, now: fixture.now };
}
