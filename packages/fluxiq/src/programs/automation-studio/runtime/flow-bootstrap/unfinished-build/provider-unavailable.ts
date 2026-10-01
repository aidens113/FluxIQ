// The model provider stopped answering: reported as exactly that.
//
// **The failure this closes (live run `run-muq05kas-058193f0`, 2026-10-01).**
// During a DeepSeek outage every decision call waited out its deadline. The
// build counted each as the model's unusable decision, called the round
// stalled after eight, "explored again" and began a second round of waits, and
// the person's chat said "Thinking about the next step" for as long as anyone
// watched. Nothing was wrong with the task or the model's work; the provider
// was not answering, and nobody was told.
//
// Now an unbroken run of unanswered calls (`../../llm/unanswered-calls.ts`)
// ends the build at once, with no test and no further round: the person reads
// that the AI model provider is not responding, how many requests went
// unanswered and how, that no Flow was created or changed, whether anything on
// the page was changed, and what was kept to carry on from.

import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE,
  type AutomationStudioFlowBootstrapBuildEnding
} from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioLlmEvidenceLoopProviderUnavailable } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "./contracts.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapNotDoneSaid } from "./not-done.ts";

/** The ending of a build whose model provider stopped answering. */
export function automationStudioFlowBootstrapProviderUnavailable(input: {
  providerUnavailable: AutomationStudioLlmEvidenceLoopProviderUnavailable;
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  rounds: number;
  decisions: number;
  /** How many of the build's actions changed the page. */
  changes: number;
  /** Whether the Flow so far was kept for the next build. */
  kept: boolean;
}): AutomationStudioFlowBootstrapBuildEnding {
  const { inARow, said } = input.providerUnavailable;
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const asked = (input.checklist ?? []).reduce((sum, item) => sum + 1 + (item.choices?.length ?? 0), 0);
  const happened = `The build stopped because the AI model provider is not responding: ${inARow === 1 ? "a request" : `${inARow} requests in a row`} got no answer -- ${said}.`;
  const changed = input.changes
    ? `No Flow was created or changed. ${input.changes === 1 ? "The one action" : `The ${input.changes} actions`} already taken on the page ${input.changes === 1 ? "was" : "were"} not undone.`
    : "No Flow was created or changed, and nothing on the page was changed.";
  const progress = asked && notDone.length < asked
    ? `${asked - notDone.length} of the ${asked} things you asked are done${notDone.length ? `; still to do: ${automationStudioFlowBootstrapNotDoneSaid(notDone)}` : ""}.`
    : "";
  const kept = input.kept ? "The steps worked out so far were kept, and building again carries on from them." : "Nothing was kept to carry on from.";
  const message = [happened, changed, progress, kept, "Try again once the provider is answering."].filter(Boolean).join(" ");
  return {
    kind: "provider_unavailable",
    message: message.slice(0, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE),
    notDone,
    tried: { rounds: input.rounds, decisions: input.decisions, stepsInFlow: input.judgement.stepsInFlow, tested: input.judgement.tested }
  };
}
