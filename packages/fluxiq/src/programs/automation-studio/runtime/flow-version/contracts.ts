// Which version of which graph a run executed, and what a verdict was about.
//
// Core already holds a per-graph version chain -- `graph_revisions` is
// numbered, parented and digested per Flow row, a Subflow's graph is a Flow row
// of its own, and `getFlow` materializes from that chain. What it did not hold
// was the join between a *verdict* and a *version*: the result verification
// keys to a run, and nothing anywhere recorded which graph revision that run
// actually executed. Until that join exists nothing can say whether a change
// made a Flow better or worse, because "worse than what" has no referent.
//
// This is that join, and nothing more. It records; it decides nothing.
//
// **Absent is not zero.** A Flow that existed before its graph was ever indexed
// has no revision chain, and `materializeCanonicalGraphFlow` leaves
// `metadata.graphRevision` off its document rather than writing 1. Such a graph
// is recorded here with `revision: null`, which reads as "this graph ran and it
// has no version", a different fact from "it ran at version 0" -- which never
// happens, since revision numbers start at 1. A `null` revision can never match
// another version, so it can never make a comparison, which is the safe
// direction: no rollback rule built later can be tripped by a Flow whose
// history nobody has.

import type { JsonObject } from "../../../../core/index.ts";

/** The metadata key a run's version set is written under, on the session and on the run detail. */
export const AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY = "flowVersions";

/**
 * One graph Flow, at the revision a run executed it at.
 *
 * `graphFlowId` is the `flows` row whose `graph_revisions` chain this names --
 * the orchestration Flow for the parent entry, and the Subflow's own graph Flow
 * for a Subflow the router entered. They are siblings, not parent and child:
 * each has its own revision counter, so a repair that rewrites one Subflow's
 * graph moves that graph's number and moves nothing else.
 */
export type AutomationStudioFlowGraphVersion = {
  graphFlowId: string;
  /** The `graph_revisions.revision_number` this run ran, or `null` where the graph has no chain yet. */
  revision: number | null;
  /** The Subflow this graph belongs to, where it is a Subflow's own graph rather than the orchestration Flow. */
  subflowId?: string;
};

/** A version whose revision is known, which is the only kind a judgement can be written against. */
export type AutomationStudioJudgedFlowGraphVersion = AutomationStudioFlowGraphVersion & { revision: number };

/**
 * A verdict, bound to the versions it judged.
 *
 * `status` is exactly `automationStudioResultVerificationStatus`'s four words
 * and `code` the verdict's own code, so a reader of a row sees the same
 * judgement the run's record shows. `instructionDigest` is `null` where the
 * request was never read -- a verdict Core settled from its own arithmetic asks
 * no model and reads no instruction -- and a null digest matches nothing, which
 * keeps an unknown question from being compared against a known one.
 */
export type AutomationStudioFlowGraphJudgement = {
  runId: string;
  status: "confirmed" | "refuted" | "unverified" | "no_result";
  code: string;
  instructionDigest: string | null;
  decidedAtMs: number;
  versions: readonly AutomationStudioJudgedFlowGraphVersion[];
};

/** The shape this module reads a version off: any Flow document or artifact. */
export type AutomationStudioVersionedFlowDocument = {
  flowId: string;
  metadata?: JsonObject | undefined;
};
