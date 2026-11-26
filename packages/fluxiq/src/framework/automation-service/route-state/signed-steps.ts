// Draft steps with what this attempt's routing signed for each of them (t1062).
//
// **The failure this closes.** A build's routing keys the signatures it takes by
// the digests of the pages its own calls reported (`./build-routing.ts`), and
// belongs to one attempt. The steps a task keeps carry the digests and nothing
// else, so the next attempt, assembling a Flow from those steps with its own
// routing, found none of them signed: no node of a Flow run from saved steps had
// an effect, and a press an earlier attempt held to a look
// (`SVC/answer-first/run-acts/run-gate.ts`) was never looked at, so it was never
// pressed again. Company-website `run-mwxk0spp-0e94cbfe`: the booking widget's
// Next, skipped on every replay, so the next step's control never came.
//
// So a step is kept with `routeSignatures`: exactly what the routing signed for
// it, each part from this attempt or carried from an earlier one
// (`signaturesOf`). A step it signed nothing for keeps what it had, and one that
// had nothing carries nothing: nothing is guessed. A later routing reads each
// part it did not sign from there.
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioBuildRouting } from "./build-routing.ts";

/** `steps`, each with what `routing` signed for it (header); a step it signed nothing for is returned as it was. */
export function automationStudioRouteSignedSteps<S extends AutomationStudioFlowDraftStep>(steps: readonly S[], routing: Pick<AutomationStudioBuildRouting, "signaturesOf">): S[] {
  return steps.map((step) => {
    const signed = routing.signaturesOf(step);
    return signed === undefined ? step : { ...step, routeSignatures: structuredClone(signed) as JsonObject };
  });
}
