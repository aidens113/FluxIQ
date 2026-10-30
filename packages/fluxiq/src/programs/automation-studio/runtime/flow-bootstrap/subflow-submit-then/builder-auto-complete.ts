// A builder's brief completed by Core once a yes stands (t811): after a judged
// yes for the latest revision, which the gate lets complete
// (`../subflow-candidate/subflow-trial-gate.ts`, `completion`), nothing is left for the model to
// decide -- the only completion it may send is that revision's receipt. So the
// builder's `decide` (`../subflow-candidate/builder-loop.ts`) returns that receipt itself, without
// calling the provider, as a Core-made decision whose line the chat shows
// (`../../activity/decision-reason.ts`, `core`; `../../activity/folded-reason.ts`).
//
// It is still a completion like any other: the loop sends it through the
// builder's completion check, and only where this request offers completion.
// It is made at most once for a revision and digest, so a check that refuses
// it hands the next decision back to the model rather than repeating it. A yes
// the gate does not let complete -- one Core could not confirm or held, or one
// standing while a failed test's repair is unchecked -- is not ready, and the
// model decides as before.
import { automationStudioActivityDecisionReason, automationStudioActivityFoldedReason } from "../../activity/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN_WORDS as WORDS } from "./submit-then-words.ts";

type Decide = AutomationStudioLlmEvidenceLoopInput["decide"];

/** The receipt a builder completes with. */
type Receipt = { subflowKey: string; revision: number; digest: string };

/** `decide`, answering for the model where `ready` names a receipt Core may complete with (header). */
export function automationStudioSubflowBuilderAutoComplete(decide: Decide, ready: () => Receipt | undefined): Decide {
  const made = new Set<string>();
  return async (request) => {
    const receipt = request.canComplete ? ready() : undefined;
    const key = receipt ? `${receipt.revision}\u0000${receipt.digest}` : undefined;
    if (!receipt || key === undefined || made.has(key)) return await decide(request);
    made.add(key);
    const decision = { kind: "complete", result: { subflowKey: receipt.subflowKey, revision: receipt.revision, digest: receipt.digest } };
    return automationStudioActivityDecisionReason.core(decision, automationStudioActivityFoldedReason(WORDS.completed));
  };
}
