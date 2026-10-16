import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceResendInvitation } from "../../llm/repeat-guard/index.ts";
// Its own barrel, not result-verification's, whose reads import flow-bootstrap back (a module cycle).
import type { AutomationStudioResultKeptConditionDrop } from "../../result-verification/standing-no/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission } from "./contracts.ts";
import { AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE } from "./kept-condition-dropped-code.ts";

/**
 * The refusal of a submission that drops or changes a kept condition (header
 * of `submit`, t641): Core's words, and each condition as its trial's lines
 * named it, as its revision wrote it and the rows it kept out, with the
 * revision that still stands. One issue, so the loop counts it by its own code;
 * the model's next step is said by `./submission-refusal.ts`. `resend` is Core's
 * own mark that lets the repeat guard run the invited resend once (t650).
 */
export function keptConditionRefusal(dropped: AutomationStudioResultKeptConditionDrop, standing: AutomationStudioFlowCandidate | undefined): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  const code = AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE;
  return {
    ok: false,
    issueCodes: [code],
    feedback: {
      ok: false,
      code,
      resend: "accepted_once" satisfies AutomationStudioLlmEvidenceResendInvitation,
      ...(standing ? { standingRevision: { revision: standing.revision, digest: standing.digest } } : {}),
      keptConditions: dropped.dropped.map((condition) => ({
        condition: condition.name,
        revision: condition.revision,
        written: JSON.parse(condition.written) as JsonValue,
        keptOut: condition.keptOut.map((row) => ({ label: row.label, by: row.by, ...(row.texts ? { texts: [...row.texts] } : {}) }))
      })),
      // The issue's path names the conditions dropped, so a refusal for one kept
      // condition and a later one for another are two refusals, not a run of one
      // (`./submission-refusal.ts` `refusalCode`): each is a hint refused once,
      // and hints must never add up to the run of refusals that ends a build.
      issues: [{ code, message: dropped.said, path: dropped.dropped.map((condition) => condition.written).sort().join(" | ") }],
      instruction: dropped.said
    }
  };
}
