// Fixed bounds for Flow Bootstrap: how many Subflows, rules, names and
// parameters a plan or a reply may carry, and the layout spacing. None bounds
// the node catalog the model is shown, which is every offered node, whole
// (`./catalog.ts`).
//
// **No bound here counts a Flow's nodes, edges, depth or bytes.** Those grow
// with the Flow and are derived from its size setting (`./size-limits.ts`,
// from `model/flow-size/flow-size-settings.ts`). A node cap left in these
// constants is one some reader would pick up, which is how a reply came to be
// held to sixteen nodes and a Flow to sixty-four; so none is here to be read.
//
// The canonical limits bound a full bootstrap call; the evidence limits bound
// the shape of the smaller evidence-guided reply. Both are read by the schemas,
// the parser, and the validator.

export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS = {
  maxSubflows: 8,
  maxStringLength: 2_000,
  horizontalSpacing: 320,
  verticalSpacing: 180
} as const;

export const AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS = {
  maxSummaryLength: 240,
  maxNameLength: 120,
  maxSubflows: 4,
  maxRules: 8,
  maxRouteTags: 8,
  maxParametersPerNode: 16
} as const;

/**
 * The bound on a plan node's `paceMs` (t378): the least time between two starts
 * of the node in one run, in whole milliseconds, from 1 ms to ten minutes. A
 * span's `repeat pace:` is read against it (`../script-statements/`),
 * and a pace a trial learned is held to it before promotion writes it
 * (`../../service/candidate-trial/promotion.ts`).
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS = {
  minPaceMs: 1,
  maxPaceMs: 600_000
} as const;
