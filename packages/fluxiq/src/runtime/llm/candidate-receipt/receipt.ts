import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";

/**
 * The latest accepted receipt, and what the evidence says stops it being
 * tested as it stands: `lastTrial`, its latest trial's verdict when that is a
 * failure on record (`no`, `execution_failed`); `stale`, when a submission
 * refused after it cleared it, so the trial gate would answer "stale".
 */
export type AutomationStudioLlmEvidenceCandidateReceipt = {
  revision: number;
  digest: string;
  lastTrial?: "no" | "execution_failed";
  stale?: true;
};

/**
 * The receipt of the latest accepted submission, copied from evidence rather
 * than inferred from a repeated request.
 *
 * A refused submission is no revision, so it is passed over: the accepted one
 * before it is still the Flow the model edits. Live run `run-mv6i27oi-a87fb247`
 * (D2): revision 1 was accepted and judged no, the next submission was
 * refused, and the notes this feeds said "No candidate has been accepted". A
 * newer accepted submission whose receipt is malformed is never walked past:
 * nothing is invented, and an older receipt is not the current one.
 *
 * **But it is not always testable (t741).** Social `run-mvgoawg4-ed85dd5a`
 * 0166-0167: the notes this feeds told the builder to test revision 5, whose
 * trial had answered `execution_failed`, after refused submissions had cleared
 * it, and the trial gate refused it as stale (0169). So the receipt also says
 * what its latest trial answered when that was a failure on record, and
 * whether a later refusal cleared it, read the way the submission controller
 * (`../../flow-bootstrap/candidate/submission.ts`) treats each refusal: an
 * unchanged resubmission puts the last accepted revision back; a refusal of a
 * Flow judged no, or a kept condition or step hint, leaves whatever stood; any
 * other refusal clears it. The trial is looked for in all the evidence, since
 * an earlier plan sent again is accepted under its own revision and digest
 * (social 0155). `unsure` and `not_judged` trials are not failures: the gate
 * still retests those (`../../flow-bootstrap/candidate/stall-retest.ts`).
 */
export function automationStudioLlmEvidenceLatestCandidateReceipt(evidence: readonly AutomationStudioLlmEvidenceEntry[], submitToolId = "core.submit_candidate"): AutomationStudioLlmEvidenceCandidateReceipt | undefined {
  let stale: boolean | undefined;
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const entry = evidence[index]!;
    if (entry.toolId !== submitToolId) continue;
    const value = entry.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    if (value.ok !== true) {
      stale ??= refusalEffect(value.diagnostics);
      continue;
    }
    const { revision, digest } = value;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) return undefined;
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/u.test(digest)) return undefined;
    const lastTrial = failedTrial(evidence, submitToolId, revision, digest);
    return { revision, digest, ...(lastTrial ? { lastTrial } : {}), ...(stale ? { stale: true as const } : {}) };
  }
  return undefined;
}

/** Refusals that leave whatever stood (`../../flow-bootstrap/candidate/submission.ts`). */
const LEAVES_STANDING: ReadonlySet<string> = new Set(["candidate.unchanged_after_no", "candidate.kept_condition_dropped", "candidate.kept_step_dropped"]);
/** The refusal that puts the last accepted revision back as the one to test. */
const PUTS_BACK = "candidate.unchanged_submission";

/** What one refusal did to the latest accepted revision: cleared it (true), put it back (false), or left it (undefined). */
function refusalEffect(diagnostics: unknown): boolean | undefined {
  const code = typeof diagnostics === "object" && diagnostics !== null && !Array.isArray(diagnostics) ? (diagnostics as Record<string, unknown>).code : undefined;
  if (code === PUTS_BACK) return false;
  if (typeof code === "string" && LEAVES_STANDING.has(code)) return undefined;
  return true;
}

/** The verdicts a trial answer can carry (`../../flow-bootstrap/candidate/contracts.ts`), read here without importing it. */
const VERDICTS: ReadonlySet<string> = new Set(["yes", "no", "unsure", "not_judged", "execution_failed"]);

/** The latest trial of exactly this receipt, when it failed on record; a trial answer is any entry but a submission carrying a verdict, revision and digest. */
function failedTrial(evidence: readonly AutomationStudioLlmEvidenceEntry[], submitToolId: string, revision: number, digest: string): "no" | "execution_failed" | undefined {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const entry = evidence[index]!;
    const value = entry.value;
    if (entry.toolId === submitToolId || typeof value !== "object" || value === null || Array.isArray(value)) continue;
    if (typeof value.verdict !== "string" || !VERDICTS.has(value.verdict) || value.revision !== revision || value.digest !== digest) continue;
    return value.verdict === "no" || value.verdict === "execution_failed" ? value.verdict : undefined;
  }
  return undefined;
}
