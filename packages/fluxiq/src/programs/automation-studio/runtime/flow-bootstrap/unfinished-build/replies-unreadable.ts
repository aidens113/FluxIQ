// The model's replies kept arriving unreadable: reported as exactly that, with
// how many tries it took.
//
// **Before t211 this was a bare code.** A round whose decision came back as
// something the loop could not read ended `flow_bootstrap.evidence_invalid_decision`,
// and the person read "Build failed". Now every unreadable reply is asked again
// with the same context and a note of what could not be read, and only an
// unbroken run of them (`../../llm/unreadable-reply.ts`) ends the build -- as
// this message: what happened, how many tries, which kind of damage it was
// most often, what of the request the Flow already does, and whether the steps
// found so far were kept. It is neither "not doable" -- nothing says the task cannot
// be done -- nor a budget: the budget had room left.
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE,
  type AutomationStudioFlowBootstrapBuildEnding
} from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioLlmEvidenceLoopUnreadable } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "./contracts.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapProgressSaid, automationStudioFlowBootstrapTestSaid } from "./not-done.ts";
import { automationStudioFlowBootstrapTried } from "./tried.ts";

/** The ending of a build whose model replies could not be read. */
export function automationStudioFlowBootstrapRepliesUnreadable(input: {
  unreadable: AutomationStudioLlmEvidenceLoopUnreadable;
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  rounds: number;
  decisions: number;
  /** Why each live round stopped, in order (`./tried.ts`). */
  stops?: AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"] | undefined;
  /** Whether the steps found so far were kept for the next build. */
  kept: boolean;
}): AutomationStudioFlowBootstrapBuildEnding {
  const { inARow, total, cases, said } = input.unreadable;
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const why = cases.length ? ` -- ${cases.length > 1 ? "most often because " : "because "}${said} --` : "";
  const happened = `The build stopped because the model's replies could not be read: ${inARow} in a row came back unreadable${why} and each was asked again with a note of what was wrong.`;
  const tries = `In all, ${total} of ${Math.max(total, input.decisions)} replies could not be read, over ${input.rounds === 1 ? "one live round" : `${input.rounds} live rounds`}; each was paid for and counted in the build's budget.`;
  const progress = automationStudioFlowBootstrapProgressSaid(input.checklist, input.judgement);
  const kept = input.kept ? "The steps found so far were kept, and building again carries on from them." : "Nothing was kept to carry on from.";
  const message = [happened, tries, progress, automationStudioFlowBootstrapTestSaid(input.judgement), kept].filter(Boolean).join(" ");
  return {
    kind: "replies_unreadable",
    message: message.slice(0, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE),
    notDone,
    tried: automationStudioFlowBootstrapTried(input)
  };
}
