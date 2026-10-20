import type { FlowProjectRequest } from "./flow.ts";

export type FlowRunDetailRequest = FlowProjectRequest & {
  runId: string;
  compact?: boolean;
};

export type FlowRunActionPageRequest = FlowProjectRequest & {
  runId: string;
  limit?: unknown;
  offset?: unknown;
  cursor?: string | null;
};

export type FlowRunEventPageRequest = FlowProjectRequest & {
  runId: string;
  afterSequence?: unknown;
  cursor?: string | null;
  limit?: unknown;
};

export type RuntimeSessionControlRequest = FlowProjectRequest & {
  runId: string;
  reason?: string;
};

/** `get-flow-spend` (t728): one Flow's spend, as its Lab-scoped Flow purse recorded it. */
export type FlowSpendRequest = FlowProjectRequest & {
  flowId: string;
};

/** What one phase of the Flow spent: settled provider calls (priced chat attempts for `chat`) and their charge in US dollars. */
export type FlowSpendItem = { calls: number; usd: number };

/**
 * A Flow's recorded spend, read-only. `spentUsd` and `builds` are the record's
 * totals; `calls` and `byPhase` are non-null only when a Lab-scoped Flow purse
 * itemised the record, and `byPhase` then sums to `spentUsd` unless the record
 * already held spend when itemising began. `largestInputTokens` is the most
 * input tokens one itemised call reported (`null` when none reported a count)
 * and `byRole` the itemised calls by the agent role that made them
 * (`supervisor`, `builder`, `repair`, `validator`, as the step log writes
 * `role`; a call no agent named is in none); both are `null` on a record kept
 * before they were.
 */
export type FlowSpend = {
  projectId: string;
  flowId: string;
  spentUsd: number;
  builds: number;
  calls: number | null;
  byPhase: { build: FlowSpendItem; read: FlowSpendItem; judge: FlowSpendItem; runtime: FlowSpendItem; reauthor: FlowSpendItem; chat: FlowSpendItem } | null;
  largestInputTokens: number | null;
  byRole: Record<string, FlowSpendItem> | null;
  createdAt: number;
  updatedAt: number;
};

/** `{ spend: null }` when the Flow has no spend record. */
export type FlowSpendResponse = { spend: FlowSpend | null };
