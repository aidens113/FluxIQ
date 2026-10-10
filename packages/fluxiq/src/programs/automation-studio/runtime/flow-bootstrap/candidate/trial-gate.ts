// The trial gate: the model may finish a candidate only once Core has run that
// exact candidate and the judge said yes for it.
//
// Candidate mode used to end every build on a statically valid draft that
// nothing had run (t330), so "complete" meant only "it parses". The gate puts a
// test between submission and completion. The model asks for a trial of its
// latest submission; an injected port (the service's trial runner, U2 of the
// t339 slice) runs it from the declared start and judges only what that run
// did. The answer is bound to the revision and digest that ran, so:
//
// - a yes for revision 1 says nothing about revision 2, even an identical one;
// - a no closes that exact Flow (by digest): it can be neither tested again nor
//   completed until the model changes it, so a judge cannot be asked until it
//   happens to agree;
// - unsure, not_judged and execution_failed refuse completion with the trial's
//   feedback, and a transient one may be tested again, up to
//   `MAX_TRIALS_PER_REVISION` trials of one revision in all.
//
// **The gate is the one owner of re-testing (t356).** Lane A round 4
// (`run-muyrpbnk-fef374e7`, steps 0048-0050): the second trial of revision 7
// stopped on the page's first-press "Network busy" (`web.action.rate_limited`),
// and the model's identical request to test it again was refused by the loop's
// generic repeat guard (`../../llm/repeat-guard/outcomes.ts`) as "the same call
// failed before", although nothing here forbade it. So a transient verdict
// answers with the reason `retry_allowed`, which the repeat guard reads as "may
// work if made again later" (`../../llm/repeat-guard/retry-later.ts`) and never
// refuses; the bound on re-tests is this gate's, and a re-test past it is
// refused here, by name, with what to do instead.
//
// **The same failure twice ends re-testing (t368, F2).** Lane A round 6
// (`run-muz2cj6p-80eb2179`, trials 1 and 2) re-tested revision 2 after its
// wait timed out, and it timed out again at the same step: the producer calls
// a timeout retryable, but the same step failing the same way in two trials of
// one revision is the Flow, not the page. So when an `execution_failed` trial
// stops at the same step, with the same node and failure code, as an earlier
// trial of the same revision, that revision is not tested again: the answer
// carries no re-test, says to change the step, and a later request to test it
// is refused `candidate.trial_same_failure`. The step is read from the trial's
// feedback, whose `steps` list ends at the step that stopped the run
// (`../../service/candidate-trial/feedback.ts`).
//
// **A control still on the page is tested again (t420).** Paid run R4a
// (`run-mv2nlh9l-52e476da`, 0038) stopped its one trial at a step that could
// not find its control where it was saved, though one like it was on the page. The answer carried `retry_allowed` and the generic "test it
// again if retryable", and the model hunted for a new handle and repeated acts
// on the control instead, until the repeat guard ended the build. When the
// stopping step's feedback says `targetOnPage`
// (`../../service/candidate-trial/target-on-page.ts`), the instruction now
// names the step, says the script need not change, and says to test the same
// revision again first; the verdict stays transient, so that re-test carries
// `retry_allowed` and is never refused as a repeat. If the re-test stops there
// the same way, the same-failure rule above closes the revision, and the
// instruction names the step and says to change it. Neither ever says how a
// control is found, nor asks the model to find or re-address one: that is the
// extension's work (user, 2026-10-10; t426).
//
// With no port injected the test tool says `candidate.trial_unavailable` and
// completion keeps its old meaning: the latest valid submission ends as an
// unverified draft, which is all a deployment without a trial runner can make.
// Nothing here promotes; the loop result only carries the standing verdict.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS, type AutomationStudioCandidateTrialPort, type AutomationStudioCandidateTrialResult, type AutomationStudioCandidateTrialVerdict, type AutomationStudioFlowCandidate } from "./contracts.ts";

export const AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID = "core.test_candidate";

/** Trials of one revision and digest, the first included; a transient verdict may be tested again until this many have run. */
export const AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION = 3;

/** The reason a transient verdict carries: the repeat guard never refuses an identical call whose reason says to try again (header). */
const RETEST_REASON = "retry_allowed";

const INSTRUCTIONS: Readonly<Record<AutomationStudioCandidateTrialVerdict, string>> = Object.freeze({
  yes: "The trial passed for this exact revision and digest. Complete now with exactly this revision and digest. Submitting again makes a new revision that needs its own trial.",
  no: "The judge found the trial did not do what the instruction asks. Read the feedback, change the Flow to fix it, submit the whole revised candidate, then test the new revision. This exact Flow cannot be tested again or completed.",
  unsure: "The judge could not confirm the trial did what the instruction asks, so this revision cannot complete. Read the feedback; correct the Flow, submit it and test the new revision, or test this revision again if the feedback says nothing about the Flow itself.",
  not_judged: "The trial was not judged, so this revision cannot complete. Test this revision again, or change and resubmit it if the feedback names a cause in the Flow.",
  execution_failed: "The candidate did not run to its end, so this revision cannot complete. Read the feedback for the step that failed: what it says happened, and whether trying again may pass (retryable). If it may, test this same revision again; otherwise correct that step, submit the whole candidate, then test the new revision."
});

/** What the model is told when a revision failed the same way twice. */
const SAME_FAILURE_INSTRUCTION = "This revision stopped at the same step with the same failure in two trials, so testing it again would fail the same way. Change that step, or remove it if it only checks the act before it (the judge reads the page the run ends on), submit the whole candidate, then test the new revision.";

/** What the model is told when the step a trial stopped at could not find a control still on the page (header, t420). */
function testAgainInstruction(step: OnPageStep): string {
  return `${named(step)} could not find its control where it was saved, though one like it is on the page. Nothing in your script needs to change for this: test this same revision again, with the same revision and digest, without acting on the control yourself.`;
}

/** What the model is told when that happened at the same step in two trials of one revision (header, t420). */
function stillNotFoundInstruction(step: OnPageStep): string {
  return `${named(step)} could not find its control where it was saved in two trials, though one like it was on the page both times, so testing this revision again would fail the same way. Do not repeat acts on that control. Change that step, or the steps that lead to it, submit the whole candidate, then test the new revision.`;
}

/** Verdicts after which the same revision may be tested again, within the bound. */
const TRANSIENT: ReadonlySet<AutomationStudioCandidateTrialVerdict> = new Set(["unsure", "not_judged", "execution_failed"]);

/** The model-facing test tool and the completion rule bound to its verdicts. */
export class AutomationStudioFlowCandidateTrialGate {
  readonly tool: AutomationStudioLlmEvidenceTool = {
    toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, effect: "mutate",
    description: "Ask Core to run your latest submitted candidate once, on its own with no model, from its declared start, and to judge only what that run did. Give that candidate's revision and digest exactly. The answer is a verdict (yes, no, unsure, not_judged or execution_failed) with feedback. The run acts on the site like the saved Flow would. Complete only after a yes for that exact revision and digest; any later submission needs its own trial. After a no, change the Flow and submit it before testing again. If it answers candidate.trial_unavailable, no trial can run here: complete with the latest revision and digest and the Flow stays an unverified draft.",
    inputSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false }
  };
  private readonly verdicts = new Map<string, AutomationStudioCandidateTrialResult>();
  private readonly closedDigests = new Map<string, JsonObject>();
  /** Trials run of each revision and digest. */
  private readonly trials = new Map<string, number>();
  /** The steps the `execution_failed` trials of each revision and digest stopped at. */
  private readonly stoppedAt = new Map<string, Set<string>>();
  /** Revisions that stopped at the same step twice, with that step: they are not tested again. */
  private readonly repeatedFailures = new Map<string, JsonObject>();
  private readonly fallbackSignal = new AbortController().signal;

  constructor(private readonly input: {
    latest: () => AutomationStudioFlowCandidate | undefined;
    trial?: { candidateId: string; port: AutomationStudioCandidateTrialPort } | undefined;
    signal?: AbortSignal | undefined;
  }) {
    if (input.trial && (typeof input.trial.candidateId !== "string" || !input.trial.candidateId || typeof input.trial.port !== "function")) throw new Error("candidate.trial_port_invalid");
  }

  /** Whether a trial can run here; without one, completion stays the draft-only completion it was. */
  get available(): boolean { return this.input.trial !== undefined; }

  async test(value: JsonObject, callSignal?: AbortSignal): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const revision = value.revision, digest = value.digest;
    if (!Number.isSafeInteger(revision) || typeof digest !== "string" || Object.keys(value).some((key) => key !== "revision" && key !== "digest")) {
      return refused("candidate.trial_input_invalid", "Call core.test_candidate with exactly the latest submission's revision (an integer) and digest (a string), as core.submit_candidate returned them.");
    }
    const trial = this.input.trial;
    if (!trial) return refused("candidate.trial_unavailable", "No trial runner is available here. Complete with the latest revision and digest; the Flow stays an unverified draft.");
    const latest = this.input.latest();
    if (!latest) return refused("candidate.trial_stale_revision", "There is no valid latest candidate to test. Submit a complete candidate with core.submit_candidate, then test the revision and digest it returns.");
    if (latest.revision !== revision || latest.digest !== digest) {
      return refused("candidate.trial_stale_revision", "Only the latest submitted candidate can be tested. Test the revision and digest given here.", { latestRevision: latest.revision, latestDigest: latest.digest });
    }
    const closed = this.closedDigests.get(latest.digest);
    if (closed) return refused("candidate.trial_unchanged_after_no", "This exact Flow was already tried and judged no. Change it to address that feedback, submit it, then test the new revision.", { previousFeedback: closed });
    const repeated = this.repeatedFailures.get(key(latest));
    if (repeated) return refused("candidate.trial_same_failure", repeatedInstruction(this.verdicts.get(key(latest))), { failedStep: repeated, ...(this.verdicts.get(key(latest)) ? { previousFeedback: this.verdicts.get(key(latest))!.feedback } : {}) });
    const tried = this.trials.get(key(latest)) ?? 0;
    if (tried >= AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION) {
      return refused("candidate.trial_retest_limit", `This exact revision has been tested ${tried} times without a yes, so it is not tested again. Read the last trial's feedback, change the step it names (or the Flow), submit the whole candidate, then test the new revision.`,
        { trials: tried, maxTrials: AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION, ...(this.verdicts.get(key(latest)) ? { previousFeedback: this.verdicts.get(key(latest))!.feedback } : {}) });
    }
    const signal = callSignal ?? this.input.signal ?? this.fallbackSignal;
    signal.throwIfAborted();
    this.trials.set(key(latest), tried + 1);
    const answer = await this.ask(trial, latest, signal);
    signal.throwIfAborted();
    this.verdicts.set(key(answer), answer);
    if (answer.verdict === "no") this.closedDigests.set(answer.digest, answer.feedback);
    const repeatedStep = this.recordStop(answer);
    const retestsLeft = TRANSIENT.has(answer.verdict) && !repeatedStep ? AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION - (tried + 1) : 0;
    const evidence: JsonObject = {
      ok: answer.verdict === "yes", verdict: answer.verdict, revision: answer.revision, digest: answer.digest,
      ...(answer.trialRunId ? { trialRunId: answer.trialRunId } : {}), feedback: answer.feedback, instruction: repeatedStep ? repeatedInstruction(answer) : standingInstruction(answer, retestsLeft > 0),
      ...(repeatedStep ? { failedStep: repeatedStep } : {}),
      ...(TRANSIENT.has(answer.verdict) ? { retestsLeft } : {})
    };
    // The trial ran on the target, so whatever it touched may have moved. A transient verdict with a re-test left says
    // so in its reason, so the identical request to test again is never refused as a repeat (header).
    return { kind: "llm_evidence_tool_execution", evidence, effectApplied: true, targetsUnchanged: false, resultCode: `candidate.trial_${answer.verdict}`, ...(retestsLeft > 0 ? { resultReason: RETEST_REASON } : {}) };
  }

  /** The completion rule, asked only once the receipt names the latest valid submission. */
  completion(receipt: { revision: number; digest: string }): AutomationStudioLlmEvidenceCompletionCheck {
    if (!this.input.trial) return { ok: true };
    const answer = this.verdicts.get(key(receipt));
    if (answer?.verdict === "yes") return { ok: true };
    const closed = this.closedDigests.get(receipt.digest);
    if (closed) return refusal("candidate.trial_unchanged_after_no", "This exact Flow was judged no and has not changed. Change it to address that feedback, submit it, test the new revision, and complete only after a yes.", { previousFeedback: closed });
    const repeated = this.repeatedFailures.get(key(receipt));
    if (answer && repeated) return refusal(`candidate.trial_${answer.verdict}`, repeatedInstruction(answer), { verdict: answer.verdict, failedStep: repeated, trialFeedback: answer.feedback });
    if (!answer) return refusal("candidate.trial_required", `Test this candidate first: call ${AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID} with revision ${receipt.revision} and digest ${receipt.digest}, and complete only after it answers yes for that revision and digest.`);
    const retestable = TRANSIENT.has(answer.verdict) && (this.trials.get(key(receipt)) ?? 0) < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION;
    return refusal(`candidate.trial_${answer.verdict}`, standingInstruction(answer, retestable), { verdict: answer.verdict, trialFeedback: answer.feedback });
  }

  /**
   * Records the step an `execution_failed` trial stopped at, and answers that
   * step when an earlier trial of the same revision stopped at it too, which
   * closes the revision to re-testing (header).
   */
  private recordStop(answer: AutomationStudioCandidateTrialResult): JsonObject | undefined {
    if (answer.verdict !== "execution_failed") return undefined;
    const step = stoppingStep(answer.feedback);
    if (!step) return undefined;
    const signature = JSON.stringify(step);
    const seen = this.stoppedAt.get(key(answer)) ?? new Set<string>();
    const repeated = seen.has(signature);
    seen.add(signature);
    this.stoppedAt.set(key(answer), seen);
    if (!repeated) return undefined;
    this.repeatedFailures.set(key(answer), step);
    return step;
  }

  /** The verdict standing for this candidate, when it was tried; undefined for an untested candidate. */
  standing(candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest"> | undefined): AutomationStudioCandidateTrialResult | undefined {
    const answer = candidate ? this.verdicts.get(key(candidate)) : undefined;
    return answer ? structuredClone(answer) : undefined;
  }

  private async ask(trial: { candidateId: string; port: AutomationStudioCandidateTrialPort }, latest: AutomationStudioFlowCandidate, signal: AbortSignal): Promise<AutomationStudioCandidateTrialResult> {
    const failed = (code: string): AutomationStudioCandidateTrialResult => ({ revision: latest.revision, digest: latest.digest, verdict: "execution_failed", feedback: { code } });
    let raw: unknown;
    try {
      raw = await trial.port({ candidateId: trial.candidateId, revision: latest.revision, digest: latest.digest, signal, candidate: deepFreeze(structuredClone(latest)) });
    } catch (error) {
      if (signal.aborted) throw error;
      // The port's own error text may carry page or account detail, so the model is told only that it failed.
      return failed("candidate.trial_port_failed");
    }
    const result = raw as Partial<AutomationStudioCandidateTrialResult> | null;
    if (!result || typeof result !== "object" || Array.isArray(result)
      || !(AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS as readonly unknown[]).includes(result.verdict)
      || !isJsonObject(result.feedback) || (result.trialRunId !== undefined && typeof result.trialRunId !== "string")) return failed("candidate.trial_result_invalid");
    // A verdict about another revision or digest is no verdict about this one.
    if (result.revision !== latest.revision || result.digest !== latest.digest) return failed("candidate.trial_result_mismatch");
    return { revision: latest.revision, digest: latest.digest, verdict: result.verdict!, feedback: structuredClone(result.feedback) as JsonObject, ...(result.trialRunId ? { trialRunId: result.trialRunId } : {}) };
  }
}

function key(receipt: { revision: number; digest: string }): string { return `${receipt.revision}\n${receipt.digest}`; }

/**
 * The step a failed trial stopped at, from its feedback: the last step listed,
 * when it failed, by its position, node and failure code, with the run's code.
 * Nothing when the feedback lists no failed last step (a start that failed, a
 * port that failed, a run that stopped between steps).
 */
function stoppingStep(feedback: JsonObject): JsonObject | undefined {
  const steps = feedback.steps;
  const last = Array.isArray(steps) ? steps.at(-1) : undefined;
  if (!isJsonObject(last) || last.status !== "failed" || typeof last.step !== "number" || !Number.isSafeInteger(last.step) || typeof last.definitionId !== "string") return undefined;
  return {
    step: last.step, definitionId: last.definitionId,
    ...(typeof last.failureCode === "string" ? { failureCode: last.failureCode } : {}),
    ...(typeof feedback.code === "string" ? { code: feedback.code } : {})
  };
}

/** The step a failed trial stopped at when it could not find a control still on the page (`targetOnPage`, header). */
type OnPageStep = { step: number; label?: string };

function onPageStep(answer: AutomationStudioCandidateTrialResult | undefined): OnPageStep | undefined {
  if (answer?.verdict !== "execution_failed") return undefined;
  const steps = answer.feedback.steps;
  const last = Array.isArray(steps) ? steps.at(-1) : undefined;
  if (!isJsonObject(last) || last.status !== "failed" || last.targetOnPage !== true || typeof last.step !== "number" || !Number.isSafeInteger(last.step)) return undefined;
  return { step: last.step, ...(typeof last.label === "string" && last.label.trim() ? { label: last.label.replace(/\s+/gu, " ").trim().slice(0, 80) } : {}) };
}

/** The step as the instructions name it: its number in the trial's feedback, and its own label when it has one. */
function named(step: OnPageStep): string {
  return `Step ${step.step}${step.label ? ` (${JSON.stringify(step.label)})` : ""}`;
}

/** What a verdict tells the model to do, when its revision has not failed the same way twice. */
function standingInstruction(answer: AutomationStudioCandidateTrialResult, retestable: boolean): string {
  const onPage = retestable ? onPageStep(answer) : undefined;
  return onPage ? testAgainInstruction(onPage) : INSTRUCTIONS[answer.verdict];
}

/** What the model is told once a revision stopped at the same step twice, from the latest trial of it. */
function repeatedInstruction(answer: AutomationStudioCandidateTrialResult | undefined): string {
  const onPage = onPageStep(answer);
  return onPage ? stillNotFoundInstruction(onPage) : SAME_FAILURE_INSTRUCTION;
}

function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, instruction, ...detail }, effectApplied: false, targetsUnchanged: true, resultCode: code };
}

function refusal(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction, ...detail } };
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try { return JSON.stringify(value) !== undefined; } catch { return false; }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const entry of Object.values(value)) deepFreeze(entry); Object.freeze(value); }
  return value;
}
