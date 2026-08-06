import type { JsonObject } from "../../../core/index.ts";
import type { ActionResult, ActionTarget } from "./actions.ts";
import type { StateDelta, StateSnapshot, StateValue } from "./state.ts";

export type TimelineBase = {
  id: string;
  recordingId: string;
  timestamp: number;
  monotonicOffsetMs: number;
  sequence: number;
  sourceId: string;
  confidence?: number;
  correlationId?: string;
  causationId?: string;
  metadata?: JsonObject;
};

export type ActionEntry = TimelineBase & {
  type: "action";
  actionType: string;
  parameters: Record<string, unknown>;
  target?: ActionTarget;
  origin: "operator" | "runtime" | "assistant" | "external";
  startedAt: number;
  completedAt?: number;
  result?: ActionResult;
};

export type StateDeltaEntry = TimelineBase & {
  type: "state_delta";
  deltas: StateDelta[];
};

export type StateCheckpointEntry = TimelineBase & {
  type: "state_checkpoint";
  state: StateSnapshot;
};

export type ObservationEntry = TimelineBase & {
  type: "observation";
  observationType: string;
  signals?: Record<string, StateValue>;
  payload?: JsonObject;
};

export type DomainEventEntry = TimelineBase & {
  type: "domain_event";
  eventType: string;
  payload?: JsonObject;
};

export type NoteEntry = TimelineBase & {
  type: "note";
  noteId: string;
};

export type MarkerEntry = TimelineBase & {
  type: "marker";
  label: string;
};

export type TimelineEntry =
  | ActionEntry
  | StateDeltaEntry
  | StateCheckpointEntry
  | ObservationEntry
  | DomainEventEntry
  | NoteEntry
  | MarkerEntry;
