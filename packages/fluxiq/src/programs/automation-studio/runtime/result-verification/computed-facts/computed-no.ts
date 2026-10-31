// The Core no that failing computed facts reach (framework plan P5): asked of
// no judge, and read by a repair exactly as a judge's located no is. Used by
// `../verify.ts` before any judge, and by `../site-change/held.ts` for a yes over
// a part whose requested act did not run on a pass (t796's `not_run`).

import type { AutomationStudioResultComputedFact, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultFailureRecord } from "../core-observation.ts";
import { automationStudioResultRepairDirective } from "../repair-directive.ts";
import { automationStudioResultStandingNoCoreRecord } from "../standing-no-record/index.ts";

/** Core's code for a no its computed facts reached, with no judge asked (header). */
const COMPUTED_FACT_FAILED = "core.result.computed_fact_failed";
/** Core's finding code for one computed fact that fails, beside the directive's own findings. */
const COMPUTED_FACT_FINDING = "result.computed_fact_failed";

/**
 * The Core no the failing computed facts reach (header): Core's words for the
 * reason and the observation, a repair directive built as every refutation's
 * is, each fact's sentence a finding and a `checked` line, and the located
 * defects where a judge's located no carries its own (`repair.judgement.defects`,
 * `./verdict/result-verdict.ts`), so a repair reads it exactly as it reads one.
 * It carries a standing-no record as a judge's no does (P5b), marked Core's
 * (`source: "core"`) with the defects Core located, so the trial gate keeps
 * Core's record of it (`../standing-no-record/core-record.ts`).
 */
export function automationStudioResultComputedNo(summary: AutomationStudioRunResultSummary, failing: readonly AutomationStudioResultComputedFact[]): AutomationStudioResultVerification {
  const sentences = failing.map((fact) => fact.said);
  const observation = sentences.join(" ");
  const directive = automationStudioResultRepairDirective({ summary, checked: sentences });
  const defects = failing.flatMap((fact) => fact.defects ?? []).map((defect) => ({
    kind: defect.kind, row: defect.row,
    ...(defect.column !== undefined ? { column: defect.column } : {}),
    ...(defect.value !== undefined ? { value: defect.value } : {}),
    ...(defect.step !== undefined ? { step: defect.step } : {}),
    requestWords: defect.requestWords
  }));
  const repair = {
    ...directive,
    findings: [...failing.map((fact) => ({ code: COMPUTED_FACT_FINDING, detail: fact.said })), ...directive.findings],
    judgement: { ...directive.judgement, defects }
  };
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    verdict: "does_not_answer",
    basis: "core_observation",
    code: COMPUTED_FACT_FAILED,
    reason: `Core's own record of this result shows it does not answer the request, so no judge was asked: ${observation}`,
    observation,
    repair,
    failure: automationStudioResultFailureRecord({ verdict: "does_not_answer", code: COMPUTED_FACT_FAILED, observation, repair }),
    standingNo: automationStudioResultStandingNoCoreRecord({ summary, defects: defects.map(({ requestWords: _words, ...located }) => located) })
  };
}
