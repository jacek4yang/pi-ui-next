// ActivityTimeline: the real-execution-relationship activity model.
//
// Nesting comes exclusively from Pi's parentToolCallId on tool_execution_*
// events. Start order is preserved monotonically even when completion is
// parallel. Failures stay failures even when a parent later succeeds.
//
// Bounded by design: partial previews and the per-turn call cap keep the
// timeline memory-safe on very long turns.

import type { CallSnapshot, NoteKind, TimelineCall, TurnGroup, TurnSource } from "./types.ts";
import { summarizeCallTitle } from "./summarize.ts";

const MAX_CALLS_PER_TURN = 500;
const MAX_PARTIAL_PREVIEW = 2000;
const MAX_KEPT_TURNS = 50;

export class ActivityTimeline {
  private turns: TurnGroup[] = [];
  private byId = new Map<string, TimelineCall>();
  private children = new Map<string, TimelineCall[]>();
  private orderCounter = 0;
  private turnCounter = 0;
  private droppedCalls = false;

  /** Start a new turn group. A hard boundary: nothing from the previous
   * group continues across it. */
  beginTurn(source: TurnSource, ts?: number): void {
    this.endCurrentTurn(ts);
    this.turnCounter++;
    this.turns.push({
      source,
      index: this.turnCounter,
      startedAt: ts,
      endedAt: undefined,
      calls: [],
      notes: [],
    });
    this.pruneOldTurns();
  }

  startCall(snapshot: CallSnapshot): void {
    const turn = this.currentTurn();
    if (!turn) return; // calls outside a turn are not projected
    if (this.byId.has(snapshot.toolCallId)) return; // defensive: duplicate start
    if (turn.calls.length >= MAX_CALLS_PER_TURN) {
      this.droppedCalls = true;
      return;
    }
    this.orderCounter++;
    const call: TimelineCall = {
      toolCallId: snapshot.toolCallId,
      parentToolCallId: snapshot.parentToolCallId,
      toolName: snapshot.toolName,
      args: snapshot.args,
      order: this.orderCounter,
      status: "running",
      startedAt: snapshot.ts,
      endedAt: undefined,
      title: summarizeCallTitle(snapshot.toolName, snapshot.args),
      summary: undefined,
      partialPreview: undefined,
    };
    this.byId.set(call.toolCallId, call);
    const siblings = call.parentToolCallId ? this.childrenOf(call.parentToolCallId) : turn.calls;
    siblings.push(call);
    siblings.sort((a, b) => a.order - b.order);
  }

  /** Attach bounded partial output while the call runs. */
  updateCall(toolCallId: string, partialText: string | undefined): void {
    const call = this.byId.get(toolCallId);
    if (!call || partialText === undefined) return;
    call.partialPreview =
      partialText.length > MAX_PARTIAL_PREVIEW
        ? partialText.slice(0, MAX_PARTIAL_PREVIEW)
        : partialText;
  }

  endCall(
    toolCallId: string,
    result: { isError: boolean; summary?: string; ts?: number; cancelled?: boolean },
  ): void {
    const call = this.byId.get(toolCallId);
    if (!call) return;
    call.endedAt = result.ts;
    call.summary = result.summary ?? call.summary;
    call.status = result.cancelled ? "cancelled" : result.isError ? "failure" : "success";
  }

  /** Close the current turn group explicitly (agent_end / turn_end). */
  endTurn(ts?: number): void {
    const turn = this.currentTurn();
    if (turn && turn.endedAt === undefined) turn.endedAt = ts;
  }

  /** Mark every running call cancelled (aborted turn / session shutdown). */
  cancelRunning(ts?: number): void {
    for (const call of this.byId.values()) {
      if (call.status === "running") {
        call.status = "cancelled";
        call.endedAt = ts;
      }
    }
  }

  addNote(kind: NoteKind, text: string, ts?: number): void {
    const turn = this.currentTurn();
    if (!turn) return;
    this.orderCounter++;
    turn.notes.push({ kind, text, order: this.orderCounter, ts });
  }

  reset(): void {
    this.turns = [];
    this.byId.clear();
    this.children.clear();
    this.droppedCalls = false;
  }

  turnsList(): readonly TurnGroup[] {
    return this.turns;
  }

  latestTurn(): TurnGroup | undefined {
    return this.turns[this.turns.length - 1];
  }

  findCall(toolCallId: string): TimelineCall | undefined {
    return this.byId.get(toolCallId);
  }

  childrenOf(parentToolCallId: string): TimelineCall[] {
    let list = this.children.get(parentToolCallId);
    if (!list) {
      list = [];
      this.children.set(parentToolCallId, list);
    }
    return list;
  }

  /** Every failed call, including nested ones whose parent succeeded (U2). */
  failures(): TimelineCall[] {
    const failed: TimelineCall[] = [];
    for (const call of this.byId.values()) {
      if (call.status === "failure") failed.push(call);
    }
    return failed.sort((a, b) => a.order - b.order);
  }

  /** Whether the per-turn call cap dropped records this session. */
  hasDroppedCalls(): boolean {
    return this.droppedCalls;
  }

  totalDuration(turn: TurnGroup, now: number): number | undefined {
    let min: number | undefined;
    let max: number | undefined;
    const visit = (call: TimelineCall): void => {
      const start = call.startedAt ?? turn.startedAt;
      const end = call.endedAt ?? now;
      if (start !== undefined && (min === undefined || start < min)) min = start;
      if (end !== undefined && (max === undefined || end > max)) max = end;
      for (const child of this.childrenOf(call.toolCallId)) visit(child);
    };
    for (const call of turn.calls) visit(call);
    if (min === undefined || max === undefined) return undefined;
    return Math.max(0, max - min);
  }

  private currentTurn(): TurnGroup | undefined {
    return this.turns[this.turns.length - 1];
  }

  /** Keep the timeline bounded: drop the oldest turns and their id indexes. */
  private pruneOldTurns(): void {
    while (this.turns.length > MAX_KEPT_TURNS) {
      const dropped = this.turns.shift();
      if (!dropped) break;
      const dropCall = (call: TimelineCall): void => {
        const kids = this.children.get(call.toolCallId) ?? [];
        this.byId.delete(call.toolCallId);
        this.children.delete(call.toolCallId);
        for (const child of kids) dropCall(child);
      };
      for (const call of dropped.calls) dropCall(call);
    }
  }

  private endCurrentTurn(ts?: number): void {
    const turn = this.currentTurn();
    if (turn && turn.endedAt === undefined) turn.endedAt = ts;
  }
}
