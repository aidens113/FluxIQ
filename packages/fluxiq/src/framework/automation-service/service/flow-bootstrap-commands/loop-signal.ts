import type { AutomationStudioLlmEvidenceLoopInput } from "../../../../runtime/llm/index.ts";

// A build's answer to loop detection's last two rungs (t1056; the lead's decision, 2026-11-26).
//
// No count ends a build's round any more: not its turns, calls, looks, refusals or unusable replies. With no
// `loopSignal` a round that only repeated itself went on, steered, until its purse ran out, and never reached the
// build's "test what you have, then repair" (`runtime/flow-authoring/bootstrap/unfinished-build/phases.ts`). So a loop
// whose caller has somewhere to take a stalled round hands it this `loopSignal`, as the answer-first rounds do: when
// the ladder's top rung is reached, the round ends as a stall does. Two callers take it:
// - the legacy evidence-guided build, which then tests the Flow it has, judges it and repairs it live in a new round;
// - each project brief's builder (`../project-build/brief-ports.ts`), whose stall comes back to the supervisor as that
//   brief's return, and the supervisor can brief again.
// No count is involved: the ladder climbs on what loop detection caught, and the model's own loop decision comes first.
//
// **A candidate build does not take it, nor does the project supervisor (t1063).** Neither has a round to start again:
// on this signal a candidate build's stall was the build's ending, before its result or its purse. Their loops are
// given no `loopSignal` and `personReachable: false`, so at the ladder's top a candidate build retests its latest
// revision through its trial gate where it can, and otherwise both are steered until their result, the purse, the
// clock or Stop (`./candidate-generation.ts`, `../project-build/run.ts`).
//
// Nobody is asked in the middle of a build (t976), so `ask_person` is not offered (`personReachable: false`); the round
// ends either way.

/** The loop input's `loopSignal` and `personReachable`, as keys to spread in (header). */
export function automationStudioFlowBootstrapLoopSignal(): Required<Pick<AutomationStudioLlmEvidenceLoopInput, "loopSignal" | "personReachable">> {
  return { loopSignal: () => "end", personReachable: false };
}
