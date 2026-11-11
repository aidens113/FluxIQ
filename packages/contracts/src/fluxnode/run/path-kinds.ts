// How a FluxNode run got its result (plan, N5), shared by the result and a pinned run's proposal.

/** How the run got its result: replayed the learned Flow, repaired it, or explored. */
export const FLUXNODE_RUN_PATH_KINDS = Object.freeze(["replayed", "repaired", "explored"] as const);

export type FluxNodeRunPathKind = (typeof FLUXNODE_RUN_PATH_KINDS)[number];
