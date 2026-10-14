// The subflow trial gate: a builder may finish its brief only once Core has
// tried that exact proposal of its subflow and the judge said yes for it
// (automation-project-agents-plan.md, `Subflow trial`).
//
// It asks an injected `AutomationStudioSubflowTrialPort` (the validator's
// partial entry, t538): prepare the brief's entry, run the proposal's subflow
// with its interface inputs, judge the brief's parts and the subflow's success
// check. Its verdicts are partial and kept here, apart from the whole-candidate
// gate (`../candidate/trial-gate.ts`), by type and by owner: a partial yes is
// never a whole candidate's trial, so it can never satisfy that gate's
// completion, which the supervisor's judged whole run alone does.
//
// The rules the whole gate learned hold here too, with this gate's own codes:
// the answer is bound to the revision and digest that ran; a no closes that
// exact proposal; a transient verdict may be tried again up to
// `AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION` trials in all, and says
// `retry_allowed` so the loop's repeat guard leaves the bound to this gate. A
// trial whose entry was not prepared (a predecessor did not run to its end)
// says so: its verdict is about the predecessors, not this subflow.
//
// With no port the tool says `subflow.trial_unavailable` and completion needs
// only the latest valid proposal, which then stands untried.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION, AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS, type AutomationStudioCandidateTrialVerdict } from "../candidate/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowScopeIdentity, AutomationStudioSubflowTrialPort, AutomationStudioSubflowTrialResult } from "./contracts.ts";

/** The builder's test tool: one partial trial of its latest proposal. */
export const AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID = "core.test_subflow";

const RETEST_REASON = "retry_allowed";
const TRANSIENT: ReadonlySet<AutomationStudioCandidateTrialVerdict> = new Set(["unsure", "not_judged", "execution_failed"]);

const INSTRUCTIONS: Readonly<Record<AutomationStudioCandidateTrialVerdict, string>> = Object.freeze({
  yes: "This subflow's trial passed for this exact revision and digest. It is a partial trial: it answers for this brief only and is no trial of the whole Flow. Complete with exactly this subflowKey, revision and digest. Submitting again makes a new revision that needs its own trial.",
  no: "The judge found this subflow did not do what its parts ask. Read the feedback, change the subflow to fix it, submit it with core.submit_subflow, then test the new revision. This exact proposal cannot be tested again or completed.",
  unsure: "The judge could not confirm this subflow did what its parts ask, so this revision cannot complete. Correct the subflow and submit it, or test this revision again if the feedback says nothing about the subflow itself.",
  not_judged: "The trial was not judged, so this revision cannot complete. Test it again, or change and resubmit it if the feedback names a cause in the subflow.",
  execution_failed: "The subflow did not run to its end, so this revision cannot complete. Read the feedback for the step that failed. If trying again may pass, test this same revision again; otherwise correct that step, submit the subflow, then test the new revision."
});

/** Said instead when a predecessor did not run to its end: the target never started where it should. */
const ENTRY_NOT_PREPARED = "A subflow that runs before this one did not run to its end, so this subflow did not start from its prepared entry and the verdict says nothing about it. Test this revision again; if it keeps failing there, complete with outcome blocked and say why.";

/** The model-facing partial test tool and the builder's completion rule bound to its verdicts. */
export class AutomationStudioSubflowTrialGate {
  readonly tool: AutomationStudioLlmEvidenceTool = {
    toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, effect: "mutate",
    description: "Ask Core to try your latest submitted subflow once, on its own with no model: it puts the site back, runs the subflows before this one to reach its entry, runs this subflow with its inputs, and judges it against its parts and success check. Give that proposal's revision and digest exactly. The answer is a partial verdict (yes, no, unsure, not_judged or execution_failed) with feedback; it counts for this brief only. The run acts on the site like the saved subflow would. Complete only after a yes for that exact revision and digest. If it answers subflow.trial_unavailable, no trial can run here.",
    inputSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false }
  };
  private readonly verdicts = new Map<string, AutomationStudioSubflowTrialResult>();
  private readonly closedDigests = new Map<string, JsonObject>();
  private readonly trials = new Map<string, number>();
  private readonly fallbackSignal = new AbortController().signal;

  constructor(private readonly input: {
    scope: AutomationStudioSubflowScope;
    latest: () => AutomationStudioSubflowProposal | undefined;
    port?: AutomationStudioSubflowTrialPort | undefined;
    signal?: AbortSignal | undefined;
  }) {
    if (input.port !== undefined && typeof input.port !== "function") throw new Error("subflow.trial_port_invalid");
  }

  get available(): boolean { return this.input.port !== undefined; }

  async test(value: JsonObject, callSignal?: AbortSignal): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const revision = value.revision;
    const digest = value.digest;
    if (!Number.isSafeInteger(revision) || typeof digest !== "string" || Object.keys(value).some((key) => key !== "revision" && key !== "digest")) {
      return refused("subflow.trial_input_invalid", `Call ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} with exactly the latest proposal's revision (an integer) and digest (a string), as core.submit_subflow returned them.`);
    }
    const port = this.input.port;
    if (!port) return refused("subflow.trial_unavailable", "No subflow trial runner is available here. Complete with the latest subflowKey, revision and digest; the proposal stays untried.");
    const latest = this.input.latest();
    if (!latest) return refused("subflow.trial_stale_revision", "There is no valid latest proposal to test. Submit this subflow with core.submit_subflow, then test the revision and digest it returns.");
    if (latest.revision !== revision || latest.digest !== digest) return refused("subflow.trial_stale_revision", "Only the latest proposal can be tested. Test the revision and digest given here.", { latestRevision: latest.revision, latestDigest: latest.digest });
    const closed = this.closedDigests.get(latest.digest);
    if (closed) return refused("subflow.trial_unchanged_after_no", "This exact proposal was already tried and judged no. Change it to address that feedback, submit it, then test the new revision.", { previousFeedback: closed });
    const tried = this.trials.get(key(latest)) ?? 0;
    if (tried >= AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION) {
      return refused("subflow.trial_retest_limit", `This exact revision has been tested ${tried} times without a yes, so it is not tested again. Change the step the last feedback names, submit the subflow, then test the new revision.`, { trials: tried, maxTrials: AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION });
    }
    const signal = callSignal ?? this.input.signal ?? this.fallbackSignal;
    signal.throwIfAborted();
    this.trials.set(key(latest), tried + 1);
    const answer = await this.ask(port, latest, signal);
    signal.throwIfAborted();
    this.verdicts.set(key(answer), answer);
    if (answer.verdict === "no" && answer.entryPrepared) this.closedDigests.set(answer.digest, answer.feedback);
    const retestsLeft = TRANSIENT.has(answer.verdict) || !answer.entryPrepared ? AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION - (tried + 1) : 0;
    const evidence: JsonObject = {
      ok: answer.verdict === "yes", partial: true, verdict: answer.verdict, subflowKey: answer.identity.subflowKey, revision: answer.revision, digest: answer.digest,
      entryPrepared: answer.entryPrepared, feedback: answer.feedback, promotionCredit: false,
      instruction: answer.entryPrepared ? INSTRUCTIONS[answer.verdict] : ENTRY_NOT_PREPARED
    };
    if (answer.trialRunId) evidence.trialRunId = answer.trialRunId;
    if (TRANSIENT.has(answer.verdict) || !answer.entryPrepared) evidence.retestsLeft = retestsLeft;
    const answered: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence, effectApplied: true, targetsUnchanged: false, resultCode: `subflow.trial_${answer.verdict}` };
    if (retestsLeft > 0) answered.resultReason = RETEST_REASON;
    return answered;
  }

  /** The builder's completion rule, asked once the receipt names the latest proposal. Never the whole candidate's. */
  completion(receipt: { revision: number; digest: string }): AutomationStudioLlmEvidenceCompletionCheck {
    if (!this.input.port) return { ok: true };
    const answer = this.verdicts.get(key(receipt));
    if (answer?.verdict === "yes" && answer.entryPrepared) return { ok: true };
    const closed = this.closedDigests.get(receipt.digest);
    if (closed) return refusal("subflow.trial_unchanged_after_no", "This exact proposal was judged no and has not changed. Change it, submit it, test the new revision, and complete only after a yes.", { previousFeedback: closed });
    if (!answer) return refusal("subflow.trial_required", `Test this proposal first: call ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} with revision ${receipt.revision} and digest ${receipt.digest}, and complete only after it answers yes for that revision and digest.`);
    return refusal(`subflow.trial_${answer.verdict}`, answer.entryPrepared ? INSTRUCTIONS[answer.verdict] : ENTRY_NOT_PREPARED, { verdict: answer.verdict, entryPrepared: answer.entryPrepared, trialFeedback: answer.feedback });
  }

  /** The judge's feedback when a proposal with this digest was judged no; undefined otherwise. */
  refuted(digest: string): JsonObject | undefined {
    const closed = this.closedDigests.get(digest);
    return closed ? structuredClone(closed) : undefined;
  }

  /** The partial verdict standing for this proposal, when it was tried. */
  standing(proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest"> | undefined): AutomationStudioSubflowTrialResult | undefined {
    const answer = proposal ? this.verdicts.get(key(proposal)) : undefined;
    return answer ? structuredClone(answer) : undefined;
  }

  private async ask(port: AutomationStudioSubflowTrialPort, latest: AutomationStudioSubflowProposal, signal: AbortSignal): Promise<AutomationStudioSubflowTrialResult> {
    const scope = this.input.scope;
    const identity: AutomationStudioSubflowScopeIdentity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
    const failed = (code: string): AutomationStudioSubflowTrialResult => ({ partial: true, scope: "subflow", identity: { ...identity }, revision: latest.revision, digest: latest.digest, verdict: "execution_failed", feedback: { code }, entryPrepared: false });
    let raw: unknown;
    try {
      raw = await port({ scope: structuredClone(scope), proposal: deepFreeze(structuredClone(latest)), signal });
    } catch (error) {
      if (signal.aborted) throw error;
      // The port's own error text may carry page or account detail, so the model is told only that it failed.
      return failed("subflow.trial_port_failed");
    }
    const result = raw as Partial<AutomationStudioSubflowTrialResult> | null;
    if (!result || typeof result !== "object" || result.partial !== true || result.scope !== "subflow" || typeof result.entryPrepared !== "boolean"
      || !(AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS as readonly unknown[]).includes(result.verdict) || !isJsonObject(result.feedback)
      || (result.trialRunId !== undefined && typeof result.trialRunId !== "string")) return failed("subflow.trial_result_invalid");
    // A verdict about another brief, plan, subflow, revision or digest is no verdict about this one.
    const said = result.identity;
    if (!said || said.buildId !== identity.buildId || said.briefId !== identity.briefId || said.planDigest !== identity.planDigest || said.subflowKey !== identity.subflowKey
      || result.revision !== latest.revision || result.digest !== latest.digest) return failed("subflow.trial_result_mismatch");
    const kept: AutomationStudioSubflowTrialResult = { partial: true, scope: "subflow", identity: { ...identity }, revision: latest.revision, digest: latest.digest, verdict: result.verdict!, feedback: structuredClone(result.feedback), entryPrepared: result.entryPrepared };
    if (result.trialRunId) kept.trialRunId = result.trialRunId;
    if (Array.isArray(result.acts) && result.acts.length) kept.acts = structuredClone(result.acts);
    return kept;
  }
}

function key(receipt: { revision: number; digest: string }): string { return `${receipt.revision}\n${receipt.digest}`; }

function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, instruction, ...detail }, effectApplied: false, targetsUnchanged: true, resultCode: code };
}

function refusal(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction, ...detail } };
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}
