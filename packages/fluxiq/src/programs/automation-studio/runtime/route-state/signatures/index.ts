// The route signatures a Flow node keeps: the page it started on and the page
// it left, each as the host's compact signature of a route state.
//
// A run that meets a step it cannot run reads the page and continues at the
// node whose recorded pre-state matches it (`../../executor/state-routing/`).
// The pre-state has to be recorded somewhere, and the build is where it is
// seen: each call reports the route state of the page it left, and a draft
// step's `stateBefore`/`stateAfter` digests name the pages it ran between
// (`../build-routing.ts`). The plan carries the signatures to the Flow node's
// metadata (`../../flow-bootstrap/adaptation.ts`).
//
// **Why a signature and not the route state.** A route state is the whole page
// a model is shown -- every control's name since t200 -- and a node keeping two
// would put thousands of names of recorded page text into every Flow document.
// The host signs a state into something small that holds no page text, and
// compares two signatures itself. Core stores, carries and hands back what the
// host made, and never reads a key of it: what makes two pages "the same
// state" is the domain's to say.
//
// A leaf directory: it imports nothing of the runtime but types, so the plan
// reader and the Flow writer can read it without importing the build routing
// beside it, which imports them.
export {
  AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS,
  automationStudioReadRouteSignature,
  automationStudioRouteSignaturesValue,
  type AutomationStudioRouteSignatureReading,
  type AutomationStudioRouteSignatures
} from "./value.ts";
export { AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY, automationStudioNodeRouteSignatures } from "./node.ts";
export { automationStudioCompareRouteSignatures, automationStudioSignRouteState, type AutomationStudioRouteSignatureComparison } from "./host.ts";
export { automationStudioRouteEffectHolds, automationStudioSignRouteEffect, type AutomationStudioRouteEffectReading } from "./effect.ts";
