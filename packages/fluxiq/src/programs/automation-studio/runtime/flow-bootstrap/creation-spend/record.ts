// What a Flow's creation has spent so far, kept between its builds.
//
// **One purse per Flow creation (t234).** The person's limit is a Flow's:
// $0.10 (FLUXIQ_LLM_RUN_COST_CEILING_USD, or the Flow's lower setting) for
// creating it. A creation runs from its first build until a Flow is proposed
// or a build ends "not doable", and every build in between -- a continuation
// after a budget ending, its repairs, its tests and its judges -- draws from
// that one ceiling (`../../llm/build-purse/purse.ts`). A build's purse lives
// only as long as the build, so what it spent is written here however the
// build ends, and the next build of the same Flow opens its purse with it
// (`carriedUsd`). Without this record building again started a fresh ceiling,
// and a Flow nobody could build could be paid for without end.
//
// It is held in a store of its own beside the Flow
// (`runtime/service/creation-spend.ts`), and deleted when the creation ends.
// A refuted-result repair (`recovery/refuted-result/`) keeps its own ceiling
// and never reads or writes it.

export type AutomationStudioFlowBootstrapCreationSpend = {
  kind: "flow_creation_spend";
  projectId: string;
  flowId: string;
  /** What every build of this creation has spent, in US dollars, as the build's purse counted it. */
  spentUsd: number;
  /** Builds of this creation that have ended, counting from 1. */
  builds: number;
  createdAt: number;
  updatedAt: number;
};
