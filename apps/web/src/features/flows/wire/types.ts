// What the Flow endpoints answer, as this screen reads it. The shapes mirror Core's
// `flows/executable/outline` types and the outline and history endpoints
// (`programs/automation-studio/api/flow-outline`, `handlers/graph-revisions.ts`);
// apps/web reads them off the wire rather than importing Core's module, which is
// server-side (it loads the runtime's helpers).

/** One input or output of the Flow, in words: `type` reads "text", "a list of ...". */
export type OutlinePort = { id: string; name: string; type: string; required: boolean };

/** The Flow a "Run Flow" step runs. */
export type OutlineLink = { kind: "flow" | "subflow" | "part" | "fluxnode"; id: string };

/** One way on out of a step ("Otherwise:"), with the steps it holds. */
export type OutlineArm = { words: string; steps: OutlineStep[] };

/**
 * One step a person reads. `number` is "3", "5.1" or empty for a heading;
 * `nodeIds` names the graph nodes it stands for, the one it is about first.
 */
export type OutlineStep = {
  number: string;
  nodeIds: string[];
  kind: string;
  words: string;
  /** The lasting classes it declares: move_money, delete, send_or_publish, modify_existing, create_new. */
  lasting: string[];
  children: OutlineStep[];
  arms: OutlineArm[];
  link?: OutlineLink;
};

/** Something the list cannot show as plain nesting; the graph shows it as it is. */
export type OutlineIssue = { code: string; words: string; step?: string };

export type FlowOutline = {
  interface: { needs: OutlinePort[]; gives: OutlinePort[] };
  steps: OutlineStep[];
  issues: OutlineIssue[];
};

/** `get-flow-outline`: the list and the version it was read at. */
export type OutlineAnswer = { outline: FlowOutline; revision: number };

/** A data step from the short menu, in a data step's own declaration shape. */
export type DataStepDeclaration = Record<string, unknown> & { kind: "filter" | "sort" | "limit" | "dedupe" | "sink" };

/** One change made on the list, naming steps by the numbers it shows (`edit-flow-steps`). */
export type StepEdit =
  | { kind: "set-words"; step: string; words: string }
  | { kind: "set-value"; step: string; path: string[]; value: unknown }
  | { kind: "bind-input"; step: string; path: string[]; input: string }
  | { kind: "move"; step: string; direction: "up" | "down" }
  | { kind: "delete"; step: string }
  | { kind: "add-call"; after?: string; flow: { flowId: string; name: string } }
  | { kind: "add-data"; after?: string; data: DataStepDeclaration };

/** One graph edit, as the store returns it for an undo. Passed back unread. */
export type GraphOperation = Record<string, unknown> & { op: string };

/** One saved version that changed the Flow while the person was editing. */
export type FlowChange = { revisionNumber: number; madeByLabel: string; message: string; createdAt: number };

export type FlowConflict = {
  baseRevision: number;
  currentRevision: number;
  changedBy: FlowChange[];
  /** The steps, numbered as the Flow is now, that hold what changed. */
  steps: string[];
};

/** What an edit or an undo came to. */
export type EditAnswer =
  | { kind: "saved"; revision: number; inverseOperations: GraphOperation[]; outline: FlowOutline }
  | { kind: "refused"; reason: string }
  | { kind: "conflict"; conflict: FlowConflict; outline: FlowOutline; revision: number };

/** One saved version in the history. `snapshotSha256` is null when it cannot be put back. */
export type RevisionEntry = {
  revisionNumber: number;
  madeByLabel: string;
  message: string;
  createdAt: number;
  snapshotSha256: string | null;
};

/** One Flow of the project, from `list-flow-summaries`. */
export type FlowSummary = { flowId: string; name: string; description: string; updatedAt: number };

/** One run of a Flow, from `list-flow-runs`. */
export type RunSummary = { runId: string; flowId: string; status: string; startedAt: number; costUsd?: number };
