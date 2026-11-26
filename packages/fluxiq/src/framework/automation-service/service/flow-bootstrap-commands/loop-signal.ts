import type { AutomationStudioLlmEvidenceLoopInput } from "../../../../runtime/llm/index.ts";

// A build's answer to loop detection's last two rungs (t1056; the lead's decision, 2026-11-26).
//
// No count ends a build's round any more: not its turns, calls, looks, refusals or unusable replies. With no
// `loopSignal` a round that only repeated itself went on, steered, until its purse ran out, and never reached the
// build's "test what you have, then repair" (`runtime/flow-authoring/bootstrap/unfinished-build/phases.ts`). So a build
// -- the legacy evidence-guided build, a candidate build and each project brief's builder -- hands its loop this
// `loopSignal`, as the answer-first rounds do: when the ladder's top rung is reached, the round ends as a stall does,
// and the build tests the Flow it has, judges it, and repairs it live. No count is involved: the ladder climbs on what
// loop detection caught, and the model's own loop decision comes first.
//
// Nobody is asked in the middle of a build (t976), so `ask_person` is not offered (`personReachable: false`); the round
// ends either way.

/** The loop input's `loopSignal` and `personReachable`, as keys to spread in (header). */
export function automationStudioFlowBootstrapLoopSignal(): Required<Pick<AutomationStudioLlmEvidenceLoopInput, "loopSignal" | "personReachable">> {
  return { loopSignal: () => "end", personReachable: false };
}
