// Activity timeline data model types. Pure data — no Pi imports.

export type CallStatus = "running" | "success" | "failure" | "cancelled";

export type NoteKind =
  | "notification"
  | "warning"
  | "error"
  | "retry"
  | "compaction"
  | "context-reduction"
  | "recovery"
  | "background-job";

export interface CallSnapshot {
  toolCallId: string;
  /** Set for nested calls (Pi assigns `<parent id>/<n>`). Nesting is real
   * execution relationships, never inferred from names or timing. */
  parentToolCallId?: string;
  toolName: string;
  args?: unknown;
  ts?: number;
}

export interface TimelineCall {
  toolCallId: string;
  parentToolCallId: string | undefined;
  toolName: string;
  args: unknown;
  order: number;
  status: CallStatus;
  startedAt: number | undefined;
  endedAt: number | undefined;
  /** Compact human title derived from the call arguments. */
  title: string | undefined;
  /** Human summary of the outcome, e.g. "12 matches" or "+21 -8". */
  summary: string | undefined;
  /** Bounded partial-result preview while running. */
  partialPreview: string | undefined;
}

export interface TimelineNote {
  kind: NoteKind;
  text: string;
  order: number;
  ts: number | undefined;
}

export interface TurnGroup {
  /** What started this group. Hard projection boundaries per pi-pretty-tui's
   * model: user input, steering, or a system boundary ends the prior group. */
  source: "user" | "steering" | "system" | "session";
  index: number;
  startedAt: number | undefined;
  endedAt: number | undefined;
  /** Root calls in start order. Children hang off their parent call. */
  calls: TimelineCall[];
  notes: TimelineNote[];
}

export type TurnSource = TurnGroup["source"];
