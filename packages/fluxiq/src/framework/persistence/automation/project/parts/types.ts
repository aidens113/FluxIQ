// The shapes the project's parts library reads and writes. Card, snapshot and
// trust are the runtime's (`runtime/project-parts`); here a card is a plain
// record the store keeps as JSON and hands back unread, so this directory never
// imports upward.

/** The facets a version is filtered by exactly. */
export type AutomationStudioProjectPartFacet = "site" | "input" | "output" | "lasting";

/** The facet values of one version: origins, input ids, output ids, lasting classes. */
export type AutomationStudioProjectPartFacets = Record<AutomationStudioProjectPartFacet, readonly string[]>;

/** One part: which version is the newest, and the Flow and Subflow it was first saved from. */
export type AutomationStudioProjectPartRecord = {
  partId: string;
  latestVersion: number;
  sourceFlowId: string;
  sourceSubflowId: string;
  createdAtMs: number;
  updatedAtMs: number;
};

/** One version of a part. `card` is the stored card, without trust. */
export type AutomationStudioProjectPartVersionRecord = {
  partId: string;
  version: number;
  card: unknown;
  shapeHash: string;
  snapshotObjectId: string;
  sourceGraphFlowId: string;
  sourceGraphRevision: number | null;
  createdAtMs: number;
};

/** A graph a version came from: the Flow graph and the revision of it that was saved, or none where the save knew no revision. */
export type AutomationStudioProjectPartVersionSource = { graphFlowId: string; revision: number | null };

/**
 * A call from a caller to one version of a part. A Flow's graph has caller version 0:
 * `callerId` is that graph's own id, and `callerFlowId` the Flow it belongs to.
 */
export type AutomationStudioProjectPartCall = {
  callerKind: "part_version" | "flow_graph";
  callerId: string;
  callerVersion: number;
  callerNodeId: string;
  callerFlowId?: string;
  partId: string;
  version: number;
};

export type AutomationStudioProjectPartRunOutcome = "succeeded" | "failed" | "stopped";

export type AutomationStudioProjectPartRunRecord = {
  partId: string;
  version: number;
  runId: string;
  outcome: AutomationStudioProjectPartRunOutcome;
  modelCalls: number;
  finishedAtMs: number;
  /** The verdict of a judged run that executed this version as saved: yes it answers, no it does not. Absent for a run nobody judged. */
  judged?: "yes" | "no" | null;
};

/** What one write of a version takes. The store assigns the version, so the card is given without one. */
export type AutomationStudioProjectPartWrite = {
  partId: string;
  sourceFlowId: string;
  sourceSubflowId: string;
  /** The card without trust. Its `version` is overwritten with the one the store assigns. */
  card: Record<string, unknown>;
  /** What the full-text index holds for the version: the name, the purpose and the port names. Nothing else is searchable. */
  searchable: { name: string; purpose: string; ports: readonly string[] };
  shapeHash: string;
  facets: AutomationStudioProjectPartFacets;
  /** The version's snapshot: its graph and its start and end checks. */
  snapshot: unknown;
  sourceGraphFlowId: string;
  sourceGraphRevision?: number | null | undefined;
  /** The calls this version makes, by the node that makes each. */
  calls: readonly { nodeId: string; partId: string; version: number }[];
  now?: number | undefined;
};

/** A write either made a new version, or found one with the same shape and wrote nothing. */
export type AutomationStudioProjectPartWriteResult = {
  status: "created" | "new_version" | "existing";
  part: AutomationStudioProjectPartRecord;
  version: AutomationStudioProjectPartVersionRecord;
};

export type AutomationStudioProjectPartQuery = {
  /** Words to search: name, purpose and port names. */
  text?: string | undefined;
  site?: string | readonly string[] | undefined;
  input?: string | readonly string[] | undefined;
  output?: string | readonly string[] | undefined;
  lasting?: string | readonly string[] | undefined;
  /** Parts a Flow calls, from any of its graphs. */
  callerFlowId?: string | undefined;
  /** Parts first saved from a Flow. */
  sourceFlowId?: string | undefined;
  limit?: number | undefined;
  cursor?: string | null | undefined;
};

/** A part with its newest version. */
export type AutomationStudioProjectPartMatch = { part: AutomationStudioProjectPartRecord; version: AutomationStudioProjectPartVersionRecord };

export type AutomationStudioProjectPartPage = { items: AutomationStudioProjectPartMatch[]; nextCursor: string | null; hasMore: boolean };
