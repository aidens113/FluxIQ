// The model's replies kept arriving unreadable: reported as exactly that, with
// how many tries it took -- in a person's words (t195-w48): "the replies it got
// back", as the stop's own reason says it (`./not-done.ts`), and no "model"
// or "round". A build that ran more than one live round says so as every
// ending does (`automationStudioFlowBootstrapWorkedLiveSaid`); the counts stay
// in `tried`.
//
// **Before t211 this was a bare code.** A round whose decision came back as
// something the loop could not read ended `flow_bootstrap.evidence_invalid_decision`,
// and the person read "Build failed". Now every unreadable reply is asked again
// with the same context and a note of what could not be read, and only an
// unbroken run of them (`../../llm/unreadable-reply.ts`) ends the build -- as
// this message: what happened, how many tries, which kind of damage it was
// most often, what of the request the Flow already does, and whether the steps
// found so far were kept. It is neither "not doable" -- nothing says the task cannot
// be done -- nor a budget: the budget had room left. The message is fitted,
// never cut inside a sentence (`./ending-fit.ts`; t193 round 1003): what was
// kept closes it, always whole.
import type { AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioLlmEvidenceLoopUnreadable } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "./contracts.ts";
import { automationStudioFlowBootstrapEndingFitted } from "./ending-fit.ts";
import { automationStudioFlowBootstrapKeptSaid } from "./kept-said.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapProgressAndTestSaid, automationStudioFlowBootstrapWorkedLiveSaid } from "./not-done.ts";
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
  const happened = `The build stopped because the replies it got back could not be read: ${inARow} in a row came back unreadable${why} and it asked again each time, with a note of what was wrong.`;
  const tries = `In all, ${total} of ${Math.max(total, input.decisions)} replies could not be read; each was paid for and counted in the build's budget.`;
  // One live round is the stop just said; more are said as every ending says them.
  const worked = input.rounds > 1 ? `${automationStudioFlowBootstrapWorkedLiveSaid(input.rounds)}.` : "";
  const kept = automationStudioFlowBootstrapKeptSaid(input.kept);
  // How far it got and what its test found, said once (`./not-done.ts`).
  const message = automationStudioFlowBootstrapEndingFitted((room) => ({
    body: [happened, tries, automationStudioFlowBootstrapProgressAndTestSaid(input.checklist, input.judgement, room)],
    close: [worked, kept].filter(Boolean)
  }));
  return {
    kind: "replies_unreadable",
    message,
    notDone,
    tried: automationStudioFlowBootstrapTried(input)
  };
}
