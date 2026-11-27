import { randomUUID } from "node:crypto";
import { AutomationStudioFlowBootstrapGenerationError, automationStudioFlowBootstrapRefusedSteps, flowBootstrapEvidenceLoopFailure, flowBootstrapEvidenceUnusableDecisionFailure, flowBootstrapHarnessFailure, sanitizedBootstrapAccounting, type AutomationStudioBootstrapAccounting, type AutomationStudioFlowBootstrapFailureStage } from "../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioFlowBootstrapFailureWithCandidate } from "../candidate-failure/index.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop } from "../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import { automationStudioLlmUnusableDecisionError, type AutomationStudioLlmEvidenceLoopAccounting, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceLoopTrace, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmTaskResult } from "../../../../runtime/llm/index.ts";
import { automationStudioActivityDecisionReason, automationStudioActivityIssuesOf, automationStudioActivityReasonText, observeAutomationStudioEvidenceLoop } from "../../../../runtime/automation-activity/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord, AutomationStudioFlowCandidateDraftStore } from "../candidate-drafts/index.ts";
import type { AutomationStudioInstructionAuthorityUsage } from "../index.ts";
import { AutomationStudioCandidateSource as Source } from "../candidate-drafts/index.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateOriginalSourceBinding, AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialResult, AutomationStudioCandidateTrialVerdict, AutomationStudioFlowCandidate } from "../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import type { AutomationStudioSiteResetLedger } from "../../../../runtime/flow-authoring/bootstrap/site-reset/index.ts";
import { automationStudioFlowBootstrapFailureWithSpend } from "./failure-spend.ts";

/** `core.submit_candidate` (`../../flow-bootstrap/candidate/authoring-loop.ts`). */
const SUBMIT_CANDIDATE = "core.submit_candidate";
/** The most characters of one refused step's words kept, as the chat quotes them (`../../activity/wording/issue-words.ts`). */
const STEP_WORDS = 80;

type AuthoringInput = Parameters<typeof runAutomationStudioFlowCandidateAuthoringLoop>[0];
type Decide = AuthoringInput["loop"]["decide"];

/**
 * Discovery/submission ends in a durable unverified draft, never an adaptation.
 * With a trial port (t340) the model can test its candidate and completes only
 * on a yes for its exact latest revision and digest; the draft is saved either
 * way, under the candidate id minted before the loop, and the standing verdict
 * is returned for the caller to promote or not. This never promotes.
 *
 * An unusable decision is refused and asked again, as the legacy round's is
 * (`./unusable-decisions.ts`, t354), and every ending carries the build's spend
 * (`./failure-spend.ts`).
 *
 * **No stall ends a candidate build (t1063).** Its loop is given no
 * `loopSignal` and no person to ask, as the project supervisor's is
 * (`../project-build/run.ts`). When loop detection's ladder reaches its top
 * rung, the loop asks for the build's own move first: a retest of the latest
 * revision through the trial gate -- its test from the start and its judges --
 * where the gate can still run one (`../../../../runtime/flow-authoring/bootstrap/candidate/stall-retest.ts`),
 * and the build goes on with that answer. Otherwise the model is steered and
 * decides how to go on (`core.loop_decision`). The build ends only on its
 * result, the purse, the clock or Stop. t1056 had handed it the bootstrap's
 * `loopSignal`, which ends a round on that rung; a bootstrap then tests,
 * judges and repairs in a new round, but a candidate build has no rounds, so
 * the rung ended the build (`flow_bootstrap.evidence_repeat_without_progress`
 * or `evidence_unusable_decision`) before its result or its purse.
 *
 * A build that fails after the model wrote a valid candidate keeps the latest
 * one it wrote as an unverified draft, as a finished build keeps its own, and
 * its failure names the candidate, that revision and each trial's verdict
 * (`../candidate-failure/`, t362): round 4's no-progress ending said the Flow
 * "has no steps yet" over four accepted revisions and two trials. A budget
 * that ran out while the latest submissions were refused names the steps they
 * were refused at (t1056).
 */
export async function generateAutomationStudioFlowCandidateDraft(input: {
  submission: AuthoringInput["submission"];
  loop: Omit<AuthoringInput["loop"], "decide" | "unusableDecisions">;
  harness: Omit<AutomationStudioLlmHarnessInput, "taskKind" | "expectedOutput" | "evidenceLoop" | "signal"> & { provider: NonNullable<AutomationStudioLlmHarnessInput["provider"]> };
  runHarness(request: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult>;
  wrapDecision(decide: Decide): Decide;
  beforeDecision(): void;
  progress(accounting: AutomationStudioBootstrapAccounting, stage: AutomationStudioFlowBootstrapFailureStage): void;
  /** The build's own ending (a permission ask, a person needed) for a loop that stopped or stalled, or `undefined`. */
  ending(progress: { trace: readonly AutomationStudioLlmEvidenceLoopTrace[]; accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting> }, accounting: AutomationStudioBootstrapAccounting): Error | undefined;
  authorityUsage: AutomationStudioInstructionAuthorityUsage;
  sourceInstructionIds: string[];
  baseSettingsRevision: number;
  currentBinding(): Promise<{ executionDigest: string; settingsRevision: number }>;
  store: Pick<AutomationStudioFlowCandidateDraftStore, "save">;
  originalSource?: AutomationStudioCandidateOriginalSourceBinding;
  /** The candidate's id, minted before the loop because every trial request names it. Required with `trial`. */
  candidateId?: string;
  /** The service's trial runner; absent, completion ends as an unverified draft as before. */
  trial?: AutomationStudioCandidateTrialPort;
  /** What the trials' judges have spent so far, counted into the build's accounting. */
  trialSpend?: () => { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };
  /** Every trial the runner has run of this candidate so far, in order, for a failure to name (`../candidate-trial/`, `records`). */
  trialRecords?: () => ReadonlyArray<{ revision: number; verdict: AutomationStudioCandidateTrialVerdict; trialRunId?: string; code?: string }>;
  /** The build's ledger of its own lasting acts, which its permission wrapper is told every call it ran; with `trial`, each trial waits for the site to be put back (t462). */
  siteReset?: AutomationStudioSiteResetLedger;
}): Promise<{ record: AutomationStudioFlowCandidateDraftRecord; trial: AutomationStudioCandidateTrialResult | undefined }> {
  if (input.trial && (typeof input.candidateId !== "string" || !input.candidateId)) throw new Error("candidate.trial_candidate_id_required");
  const candidateId = input.candidateId ?? `candidate.${randomUUID()}`;
  const descriptor = Object.getOwnPropertyDescriptor(input, "originalSource");
  if (descriptor && (!Object.hasOwn(descriptor, "value") || descriptor.value === undefined)) throw new Error("candidate.original_binding_invalid");
  const originalSource = descriptor ? Source.validate(descriptor.value as AutomationStudioCandidateOriginalSourceBinding) : undefined;
  const projectId = input.submission.projectId, flowId = input.submission.flowId, instructionText = input.submission.instructionText ?? "";
  const sourceInstructionIds = originalSource ? fingerprint.snapshot(input.sourceInstructionIds) : structuredClone(input.sourceInstructionIds), baseSettingsRevision = input.baseSettingsRevision;
  if (originalSource) {
    const submittedDescriptor = Object.getOwnPropertyDescriptor(input.submission, "originalSource");
    if (!submittedDescriptor || !Object.hasOwn(submittedDescriptor, "value")) throw new Error("candidate.original_binding_invalid");
    const submitted = Source.validate(submittedDescriptor.value as AutomationStudioCandidateOriginalSourceBinding);
    if (originalSource.originalSources.projectId !== projectId || originalSource.originalSources.flowId !== flowId
      || submitted.originalInstructionsDigest !== originalSource.originalInstructionsDigest
      || JSON.stringify(sourceInstructionIds) !== JSON.stringify(originalSource.originalSources.effectiveInstructionIds) || instructionText !== Source.text(originalSource)) throw new Error("candidate.original_binding_mismatch");
    fingerprint.snapshot({ originalSources: originalSource.originalSources, instructionText });
  } else if (Object.hasOwn(input.submission, "originalSource")) throw new Error("candidate.original_binding_mismatch");
  let estimatedInputTokens = 0;
  const requestId = `candidate.${randomUUID()}`, observedUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
  // The trials' judges are provider calls of this build too, made outside the loop's own decisions.
  const accounted = (spent: typeof observedUsage) => { const judged = input.trialSpend?.() ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }; return sanitizedBootstrapAccounting({ requestId, estimatedInputTokens: estimatedInputTokens + input.authorityUsage.estimatedInputTokens,
    provider: input.harness.provider.metadata.provider, model: input.harness.provider.metadata.model,
    inputTokens: spent.inputTokens + input.authorityUsage.inputTokens + judged.inputTokens, outputTokens: spent.outputTokens + input.authorityUsage.outputTokens + judged.outputTokens,
    totalTokens: spent.totalTokens + input.authorityUsage.totalTokens + judged.totalTokens, estimatedCostUsd: spent.estimatedCostUsd + input.authorityUsage.estimatedCostUsd + judged.estimatedCostUsd }); };
  // The steps the latest submission was refused at, in the model's words screened as the chat's are, so a budget's ending names them (`../../flow-bootstrap/generation-failure/refused-steps.ts`, t378).
  let refusedSteps: ReturnType<typeof automationStudioActivityIssuesOf> = [];
  const noteRefusedSteps = (loop: AutomationStudioLlmEvidenceLoopInput): AutomationStudioLlmEvidenceLoopInput => ({ ...loop, executeTool: async (call) => {
    const result = await loop.executeTool.call(loop, call);
    const answer = call.toolId === SUBMIT_CANDIDATE ? (result as { evidence?: { ok?: unknown; diagnostics?: unknown } } | undefined)?.evidence : undefined;
    if (answer?.ok === true) refusedSteps = [];
    if (answer?.ok === false) refusedSteps = automationStudioActivityIssuesOf(answer.diagnostics).map((issue) => ({ ...issue, step: automationStudioActivityReasonText(issue.step, STEP_WORDS) }));
    return result;
  } });
  // What makes the loop ask again after a reply it cannot use, or a refused completion, rather than end there. Its `stalled`,
  // which the option requires, builds the ending of a round a caller ends on loop detection's signal or a person's question;
  // this build gives neither (header, t1063), so it is never reached, as the project supervisor's is not (`../project-build/run.ts`).
  const unusableDecisions = { stalled: (progress: Parameters<typeof flowBootstrapEvidenceUnusableDecisionFailure>[0]) => flowBootstrapEvidenceUnusableDecisionFailure(progress, accounted(progress.accounting)) };
  // A budget that ran out while the latest submissions were refused says so: what the money last went on, as a detail of
  // the budget's ending rather than an ending of its own (t1056).
  const withRefusedSteps = (failure: AutomationStudioFlowBootstrapGenerationError): AutomationStudioFlowBootstrapGenerationError => {
    const steps = failure.diagnostic.code === "flow_bootstrap.evidence_iteration_limit" ? automationStudioFlowBootstrapRefusedSteps.bounded(refusedSteps) : [];
    return steps.length ? new AutomationStudioFlowBootstrapGenerationError({ ...failure.diagnostic, refusedSteps: steps }) : failure;
  };
  // The latest submission Core accepted: a refused resubmission clears the loop's own `latest`, and a failed build still keeps this one.
  let accepted: AutomationStudioFlowCandidate | undefined;
  const draftRecord = (candidate: AutomationStudioFlowCandidate, accounting: AutomationStudioBootstrapAccounting): AutomationStudioFlowCandidateDraftRecord => {
    const common = { kind: "flow_candidate_draft" as const, status: "draft" as const, verification: "not_performed" as const,
      candidateId, projectId, flowId, sourceInstructionIds: [...sourceInstructionIds], instructionText,
      baseSettingsRevision, accounting, createdAt: Date.now() };
    return originalSource
      ? { ...common, schemaVersion: 2, originalSources: originalSource.originalSources, originalInstructionsDigest: originalSource.originalInstructionsDigest,
          candidate: { ...candidate, fingerprintVersion: "candidate.plan+original_sources.v2", originalInstructionsDigest: originalSource.originalInstructionsDigest } }
      : { ...common, schemaVersion: 1, candidate };
  };
  // Whether a failed build may keep `candidate` as its draft: never once stopped, and only when written against the Flow and settings as they still are, bound to the same original instructions.
  const keepable = async (candidate: AutomationStudioFlowCandidate): Promise<boolean> => {
    if (input.loop.signal?.aborted || input.submission.signal?.aborted) return false;
    const current = await input.currentBinding();
    if (current.executionDigest !== candidate.baseDependencyDigest || current.settingsRevision !== baseSettingsRevision) return false;
    return !originalSource || (candidate.fingerprintVersion === "candidate.plan+original_sources.v2" && candidate.originalInstructionsDigest === originalSource.originalInstructionsDigest);
  };
  const withCandidate = (error: unknown) => automationStudioFlowBootstrapFailureWithCandidate(error, {
    candidateId, latest: accepted, trials: input.trialRecords?.() ?? [],
    keep: async (candidate) => {
      if (!(await keepable(candidate))) return false;
      await input.store.save(draftRecord(candidate, accounted(observedUsage)), input.loop.signal);
      return true;
    }
  });
  const authored = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: input.submission, ...(input.trial ? { trial: { candidateId, port: input.trial } } : {}), ...(input.siteReset ? { siteReset: input.siteReset } : {}),
    accepted: (candidate) => { accepted = structuredClone(candidate); },
    // The loop observes its whole input, its own two tools among the calls, so saving and testing the Flow are cards in the chat (t373).
    observe: (loop) => noteRefusedSteps(observeAutomationStudioEvidenceLoop(loop)),
    // No `loopSignal`, and no person to ask: at the ladder's top rung the loop retests the latest revision through the trial gate where it can,
    // and otherwise steers; the build ends only on its result, the purse, the clock or Stop (header, t1063).
    loop: { ...input.loop, personReachable: false, unusableDecisions, decide: input.wrapDecision(async ({ iteration, tools, evidence, decisionSchema, canComplete, signal }) => {
      input.beforeDecision();
      input.progress(accounted(observedUsage), "provider_request");
      const decision = await input.runHarness({
        ...input.harness, taskKind: "evidence_tool_decision", expectedOutput: "evidence_tool_decision",
        evidenceLoop: { iteration, tools, evidence: evidence.map(entry => ({ ...entry })), decisionSchema, completionSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false }, canComplete },
        ...(signal ? { signal } : {})
      });
      estimatedInputTokens += decision.request.estimatedInputTokens;
      for (const key of ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"] as const) observedUsage[key] += decision.usage?.[key] ?? 0;
      const unusable = decision.ok && decision.response?.kind === "evidence_tool_decision" ? undefined : automationStudioLlmUnusableDecisionError(decision);
      // A reply arrived, usable or not: a failure from here is about the answer, never "the model could not be reached" (round 3's C2).
      input.progress(accounted(observedUsage), decision.ok || (unusable !== undefined && !unusable.providerUnanswered) ? "provider_output_validation" : "provider_request");
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw unusable ?? flowBootstrapHarnessFailure(decision);
      return automationStudioActivityDecisionReason.attach({ ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) }, decision.response.summary);
    }) }
  }).catch(async (error: unknown) => { throw await withCandidate(automationStudioFlowBootstrapFailureWithSpend(error, accounted(observedUsage))); }); // Whatever ended it, the failure says what the build spent (round 3's C3) and what it wrote (t362).
  const accounting = accounted(authored.loop.accounting);
  input.progress(accounting, "post_provider_validation");
  if (!authored.loop.ok) throw await withCandidate(input.ending(authored.loop, accounting) ?? withRefusedSteps(flowBootstrapEvidenceLoopFailure(authored.loop, accounting)));
  if (!authored.candidate) throw new Error("FLOW_CANDIDATE_MISSING: No latest submitted candidate.");
  input.loop.signal?.throwIfAborted(); input.submission.signal?.throwIfAborted();
  const current = await input.currentBinding();
  if (current.executionDigest !== authored.candidate.baseDependencyDigest || current.settingsRevision !== baseSettingsRevision) throw new Error("FLOW_BOOTSTRAP_STALE: Flow or settings changed during candidate generation.");
  if (originalSource && (authored.candidate.fingerprintVersion !== "candidate.plan+original_sources.v2" || authored.candidate.originalInstructionsDigest !== originalSource.originalInstructionsDigest)) throw new Error("candidate.original_binding_mismatch");
  input.loop.signal?.throwIfAborted(); input.submission.signal?.throwIfAborted();
  input.progress(accounting, "persistence");
  return { record: await input.store.save(draftRecord(authored.candidate, accounting), input.loop.signal), trial: authored.trial };
}
