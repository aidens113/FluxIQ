// The signature of the Flow a build's first round starts from, for the
// no-progress rule (`./phases.ts`, `seedSignature`; run 38's C8, t240).
//
// Round 0 of an extend build, or of a build continuing a kept draft, already
// holds a Flow. A first round that ends on refused repeats and hands that Flow
// back unchanged has made no progress, and ends the build rather than opening a
// second identical round. A fresh build starts from nothing, so it has no
// signature to compare against.

import { automationStudioFlowDraftReplaySignature, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

/** `{ seedSignature }` for a round 0 that starts from a Flow, or nothing for one that starts from none. */
export function automationStudioFlowBootstrapSeedSignature(seed: readonly AutomationStudioFlowDraftStep[] | undefined): { seedSignature?: string } {
  return seed?.length ? { seedSignature: automationStudioFlowDraftReplaySignature(seed) } : {};
}
