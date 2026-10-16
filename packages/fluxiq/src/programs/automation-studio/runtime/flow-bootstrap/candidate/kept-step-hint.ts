// The one-time hint given a submission that no longer reads the request's
// words a step chose (t666), for the submission controller (`./submission.ts`).
//
// **Why.** A8 frozen pair 8 candidate towels `run-mvam0lys-2d3eb090`: a no Core
// could not weigh got a step dropped that chose, in a named group, an option
// the request names in its own words, and nothing in the Flow read that part
// of the request again.
//
// **What it does.** The latest accepted revision's trial that the gate kept
// says which steps before its reads chose what (`feedback.reads[].narrowedBefore`).
// A model's submission that no longer has such a step as written, and tests
// its words in no condition (`../../result-verification/standing-no/kept-steps.ts`),
// is refused `candidate.kept_step_dropped` with Core's words naming the step,
// the option and the request's words. Once per step and the trial that showed
// it: the same submission sent again is accepted, so it is a hint, never a
// block. The refusal carries Core's resend mark (t650) so the repeat guard
// runs that resend, and its next step is said as a hint
// (`./submission-refusal.ts`), as t641's kept-condition refusal is.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceResendInvitation } from "../../llm/repeat-guard/index.ts";
// Its own barrel, not result-verification's (a module cycle; `./submission.ts`).
import { automationStudioResultKeptStepsDropped, type AutomationStudioResultKeptStepDrop } from "../../result-verification/standing-no/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission, AutomationStudioFlowCandidateSubmissionHistory } from "./contracts.ts";

/** The code a submission no longer reading the request's words a step chose is refused under, once (header). */
export const AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE = "candidate.kept_step_dropped";

/** One controller's hints for dropped steps that chose the request's own words (header). */
export class AutomationStudioCandidateKeptStepHint {
  /** Each step hinted already, by the revision whose trial showed it and as that revision wrote it: once, never twice. */
  private readonly given = new Set<string>();

  /**
   * The refusal for `plan` where it drops such a step of the latest accepted
   * revision (in `accepted`, oldest first) whose trial `history` holds, not
   * hinted before; nothing otherwise. Each step found is hinted this once.
   */
  hint(input: {
    accepted: readonly AutomationStudioFlowCandidate[];
    plan: AutomationStudioFlowBootstrapPlan;
    history: AutomationStudioFlowCandidateSubmissionHistory;
    requestText: string | undefined;
    subject?: string | undefined;
    standing: AutomationStudioFlowCandidate | undefined;
  }): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] | undefined {
    const trialOf = input.history.trialOf;
    if (!trialOf) return undefined;
    const ran = [...input.accepted].reverse().map((earlier) => ({ earlier, trial: trialOf(earlier) })).find((found) => found.trial !== undefined);
    if (!ran) return undefined;
    const revision = ran.earlier.revision;
    const prefix = key(revision, "");
    const refused = new Set([...this.given].filter((given) => given.startsWith(prefix)).map((given) => given.slice(prefix.length)));
    const found = automationStudioResultKeptStepsDropped({ trial: ran.trial, revision, ran: ran.earlier.buildPlan.plan, plan: input.plan, requestText: input.requestText, refused, subject: input.subject });
    if (!found) return undefined;
    for (const step of found.dropped) this.given.add(key(step.revision, step.written));
    return refusal(found, input.standing);
  }
}

function key(revision: number, written: string): string {
  return `${revision}\n${written}`;
}

/**
 * The refusal (header): Core's words, each step as written, the option it
 * chose and the request's words, with the revision that still stands; one
 * issue whose path names the steps, so two hints about two steps are two
 * refusals, never one run; and the mark that admits the invited resend once.
 */
function refusal(dropped: AutomationStudioResultKeptStepDrop, standing: AutomationStudioFlowCandidate | undefined): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  const code = AUTOMATION_STUDIO_CANDIDATE_KEPT_STEP_DROPPED_CODE;
  return {
    ok: false,
    issueCodes: [code],
    feedback: {
      ok: false,
      code,
      resend: "accepted_once" satisfies AutomationStudioLlmEvidenceResendInvitation,
      ...(standing ? { standingRevision: { revision: standing.revision, digest: standing.digest } } : {}),
      keptSteps: dropped.dropped.map((step) => ({
        nodeId: step.nodeId,
        ...(step.label ? { step: step.label } : {}),
        revision: step.revision,
        written: JSON.parse(step.written) as JsonValue,
        group: step.group,
        chose: step.chose,
        requestWords: [...step.texts]
      })),
      issues: [{ code, message: dropped.said, path: dropped.dropped.map((step) => step.written).sort().join(" | ") }],
      instruction: dropped.said
    }
  };
}
