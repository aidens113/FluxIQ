import { formatRuntimeDuration, formatRuntimeTimestamp } from "./run-format";
export function runtimeAttemptsForRunDetail(runDetail: any | null): any[] {
  if (!runDetail) return [];
  if (Array.isArray(runDetail.actionAttempts)) return runDetail.actionAttempts;
  if (Array.isArray(runDetail.trace?.attempts)) return runDetail.trace.attempts;
  return [];
}

export function sortRuntimeRunsForDebugView(runs: any[]): any[] {
  return [...runs].sort((left, right) => runtimeRunSortTime(right) - runtimeRunSortTime(left) || String(right.runId ?? "").localeCompare(String(left.runId ?? "")));
}

function runtimeRunSortTime(run: any): number {
  return firstFiniteRuntimeNumber(run?.updatedAt, run?.updatedAtMs, run?.finishedAt, run?.startedAt, run?.queuedAt) ?? 0;
}

function firstFiniteRuntimeNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function isRuntimeJsonRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function runtimeStoryHeadline(runDetail: any): string {
  const summary = runDetail?.summary ?? {};
  const metrics = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveMetrics) ? runDetail.metadata.adaptiveMetrics : {};
  if (metrics.deterministicSuccessAfterAdaptation === true) return "FluxIQ adapted the run, retried it, and the deterministic retry succeeded.";
  if (metrics.durableBehaviorChanged === true) return "FluxIQ created or applied a durable behavior change during this run.";
  if ((runDetail?.adaptationIds?.length ?? 0) > 0) return "FluxIQ created adaptation evidence for review.";
  if ((runDetail?.interventions?.length ?? 0) > 0) return "FluxIQ used LLM assistance and preserved the intervention trail.";
  if (summary.status === "failed") return "The run failed before a durable adaptation was applied.";
  if (summary.status === "succeeded") return "The run completed deterministically.";
  return "The run is recorded with compact action and recovery detail.";
}

export function runtimeStoryStatusClass(status: unknown): string {
  const value = String(status ?? "unknown");
  if (value === "succeeded" || value === "created" || value === "applied") return "success";
  if (value === "failed" || value === "rejected") return "failed";
  if (value === "attempted" || value === "testing" || value === "running") return "active";
  return "muted";
}

export function runtimeTokenLabel(tokenUsage: any): string {
  const total = tokenUsage?.totalTokens;
  if (typeof total === "number" && Number.isFinite(total)) return String(total);
  const input = tokenUsage?.inputTokens;
  const output = tokenUsage?.outputTokens;
  if (typeof input === "number" || typeof output === "number") return `${input ?? 0}/${output ?? 0}`;
  return "-";
}

export function runtimeCostLabel(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? `$${value.toFixed(4)}` : "$0";
}

export function runtimeRunOverviewItems(runDetail: any): Array<[string, string]> {
  const summary = runDetail?.summary ?? {};
  const metadata = runDetail?.metadata ?? {};
  return [
    ["Started", formatRuntimeTimestamp(summary.startedAt)],
    ["Finished", formatRuntimeTimestamp(summary.finishedAt)],
    ["Duration", formatRuntimeDuration(summary.startedAt, summary.finishedAt)],
    ["Flow version", String(summary.flowVersion ?? metadata.flowVersion ?? "Current")],
    ["Intervention mode", runtimeInterventionModeLabel(metadata.runningMode ?? metadata.interventionMode ?? metadata.trainingMode)],
    ["Outcome", String(metadata.terminalFailureReason ?? metadata.terminalReason ?? metadata.message ?? summary.status ?? "Unknown")]
  ];
}

export function runtimeInterventionModeLabel(value: unknown): string {
  if (value === "manual_approval") return "Manual approval";
  if (value === "deterministic" || value === "deterministic_only") return "No LLM intervention";
  if (value === "default" || value === "continuous_adaptive" || value === "fully_adaptive") return "Fully adaptive";
  return value ? String(value).replace(/_/g, " ") : "Saved Flow setting";
}
export function runtimeRecoveryRoutingEvents(routeDecisions: any[], recoveryAttempts: any[]): Array<{ id: string; kind: "route" | "recovery"; timestamp: number; title: string; target: string; status: string; reason: string; fallback: boolean; rejected: string[]; detail: any }> {
  const routes = routeDecisions.map((decision, index) => ({
    id: String(decision.decisionId ?? `route.${index}`),
    kind: "route" as const,
    timestamp: Number(decision.decidedAt ?? 0),
    title: decision.fallbackUsed ? "Router fallback selected" : "Route selected",
    target: String(decision.selectedSubflowId ?? decision.selectedRuleId ?? "No target"),
    status: decision.selectedSubflowId || decision.selectedRuleId ? "succeeded" : "failed",
    reason: String(decision.reason ?? decision.explanation ?? (decision.fallbackUsed ? "No active rule matched." : "The selected rule matched the current signals.")),
    fallback: decision.fallbackUsed === true,
    rejected: (decision.rejectedRuleIds ?? []).map(String),
    detail: decision
  }));
  const recovery = recoveryAttempts.map((attempt, index) => ({
    id: String(attempt.recoveryId ?? attempt.attemptId ?? `recovery.${index}`),
    kind: "recovery" as const,
    timestamp: Number(attempt.startedAt ?? attempt.decidedAt ?? attempt.createdAt ?? 0),
    title: "Recovery candidate selected",
    target: String(attempt.selectedTargetNodeId ?? attempt.selectedEdgeId ?? attempt.selectedKind ?? "No target"),
    status: String(attempt.status ?? "unknown"),
    reason: String(attempt.reason ?? "No recovery explanation was recorded."),
    fallback: false,
    rejected: (attempt.rejectedCandidateIds ?? attempt.metadata?.rejectedCandidateIds ?? []).map(String),
    detail: attempt
  }));
  return [...routes, ...recovery].sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
}

/**
 * The loop's own four stages, as the run recorded them.
 *
 * "LLM", "Patch Test", "Adaptation" and "Retry" name the mechanics: which call
 * was made, which array it landed in. They do not say what the loop was trying
 * to do, so a person reading a failed run could not tell a run where the model
 * was deliberately not asked from one where nothing happened. These four say
 * it: what was wrong, what was planned, what was explored, what came of it --
 * and, for each, whether a model was called at all.
 */
export const RUNTIME_RECOVERY_STAGE_LABELS: Record<string, string> = {
  diagnosis: "Diagnosis",
  recovery_plan: "Recovery Plan",
  exploration: "Exploration",
  resolution: "Resolution"
};

export function runtimeRecoveryStageEvents(runDetail: any): Array<{ id: string; stage: string; title: string; status: string; summary: string; note?: string; detail: any }> {
  const trace = isRuntimeJsonRecord(runDetail?.metadata?.recoveryTrace) ? runDetail.metadata.recoveryTrace : null;
  const stages = Array.isArray(trace?.stages) ? trace.stages.filter(isRuntimeJsonRecord) : [];
  return stages.map((stage: any, index: number) => ({
    id: `recovery-stage.${String(stage.stage ?? index)}`,
    stage: RUNTIME_RECOVERY_STAGE_LABELS[String(stage.stage)] ?? String(stage.stage ?? "Recovery"),
    title: runtimeRecoveryStageTitle(stage),
    status: String(stage.status ?? "recorded"),
    summary: String(stage.reason ?? "No explanation was recorded for this stage."),
    // The deterministic-first receipt, in the one place a person looks.
    note: stage.providerCalled === true
      ? `Model called${stage.loopStage ? ` for the "${String(stage.loopStage)}" step of the loop` : ""}`
      : "No model call",
    detail: stage
  }));
}

function runtimeRecoveryStageTitle(stage: any): string {
  const detail = isRuntimeJsonRecord(stage?.detail) ? stage.detail : {};
  if (stage?.stage === "diagnosis") return runtimeRecoveryStagePhrase(detail.failureClass) ?? "Failure diagnosed";
  if (stage?.stage === "recovery_plan") {
    const steps = Array.isArray(detail.steps) ? detail.steps.map((step: unknown) => runtimeRecoveryStagePhrase(step)).filter(Boolean) : [];
    return steps.length ? steps.join(", then ") : "Plan recorded";
  }
  if (stage?.stage === "exploration") return detail.requested === true ? "Exploration requested" : "No exploration needed";
  if (stage?.stage === "resolution") return runtimeRecoveryStagePhrase(detail.outcome) ?? "Outcome recorded";
  return "Stage recorded";
}

function runtimeRecoveryStagePhrase(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const words = value.replace(/_/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function runtimeLlmAdaptationEvents(runDetail: any): Array<{ id: string; stage: string; title: string; status: string; summary: string; note?: string; provider?: string; model?: string; usage?: string; evidenceProvenance?: string; adaptationId?: string; detail: any }> {
  const interventions = Array.isArray(runDetail?.interventions) ? runDetail.interventions : [];
  const patchAttempts = Array.isArray(runDetail?.metadata?.runtimePatchAttempts) ? runDetail.metadata.runtimePatchAttempts : [];
  const adaptationIds = Array.isArray(runDetail?.adaptationIds) ? runDetail.adaptationIds : [];
  const retry = isRuntimeJsonRecord(runDetail?.metadata?.adaptiveRetry) ? runDetail.metadata.adaptiveRetry : null;
  const interventionEvents = interventions.map((intervention: any, index: number) => ({
    id: String(intervention.interventionId ?? `llm.${index}`),
    stage: "LLM",
    title: String(intervention.kind ?? "Intervention").replace(/_/g, " "),
    status: String(intervention.status ?? "attempted"),
    summary: String(intervention.reason ?? intervention.summary ?? intervention.approvalDecision?.reason ?? "LLM assistance was recorded."),
    ...(intervention.provider ? { provider: String(intervention.provider) } : {}),
    ...(intervention.model ? { model: String(intervention.model) } : {}),
    usage: `${runtimeTokenLabel(intervention.tokenUsage)} tokens | ${runtimeCostLabel(intervention.tokenUsage?.estimatedCostUsd)}`,
    ...(runtimeFailureEvidenceProvenance(intervention) ? { evidenceProvenance: runtimeFailureEvidenceProvenance(intervention) } : {}),
    detail: sanitizedRuntimeInterventionDetail(intervention)
  }));
  const patchEvents = patchAttempts.map((attempt: any, index: number) => ({
    id: String(attempt.patchAttemptId ?? attempt.attemptId ?? `patch.${index}`),
    stage: "Patch Test",
    title: "Candidate behavior test",
    status: String(attempt.patchedTraceStatus ?? attempt.status ?? "attempted"),
    summary: String(attempt.reason ?? attempt.message ?? (attempt.patchedTraceStatus === "succeeded" ? "The candidate passed deterministic validation." : "The candidate did not pass deterministic validation.")),
    detail: attempt
  }));
  const adaptationEvents = adaptationIds.map((adaptationId: string) => ({
    id: adaptationId,
    stage: "Adaptation",
    title: "Adaptation created",
    status: "created",
    summary: String(runDetail?.metadata?.approvalDecision?.reason ?? "A durable behavior change was recorded for review or application."),
    adaptationId,
    detail: { adaptationId, approvalDecision: runDetail?.metadata?.approvalDecision }
  }));
  const retryEvents = retry ? [{
    id: "adaptive-retry",
    stage: "Retry",
    title: "Deterministic retry",
    status: String(retry.status ?? "attempted"),
    summary: String(retry.reason ?? retry.message ?? `${retry.attemptCount ?? 0} retry actions completed with status ${retry.status ?? "attempted"}.`),
    detail: retry
  }] : [];
  // The loop stages lead, because they are what the loop was doing; the call
  // and patch mechanics follow as the detail underneath them.
  return [...runtimeRecoveryStageEvents(runDetail), ...interventionEvents, ...patchEvents, ...adaptationEvents, ...retryEvents];
}

function runtimeFailureEvidenceProvenance(intervention: any): string | undefined {
  const context = isRuntimeJsonRecord(intervention?.contextSummary) ? intervention.contextSummary : null;
  const evidence = isRuntimeJsonRecord(context?.failureEvidence) ? context.failureEvidence : null;
  const schemaVersion = typeof evidence?.schemaVersion === "string" ? evidence.schemaVersion.trim() : "";
  const byteCount = evidence?.byteCount;
  if (!schemaVersion || !Number.isSafeInteger(byteCount) || byteCount < 0 || typeof evidence?.truncated !== "boolean") return undefined;
  return `Sanitized live evidence attached · ${schemaVersion} · ${byteCount} bytes · ${evidence.truncated ? "truncated" : "full"}`;
}

function sanitizedRuntimeInterventionDetail(intervention: any): any {
  if (!isRuntimeJsonRecord(intervention)) return intervention;
  const context = isRuntimeJsonRecord(intervention.contextSummary) ? intervention.contextSummary : null;
  const evidence = isRuntimeJsonRecord(context?.failureEvidence) ? context.failureEvidence : null;
  if (!context || !evidence) return intervention;
  const safeEvidence = {
    ...(typeof evidence.schemaVersion === "string" ? { schemaVersion: evidence.schemaVersion } : {}),
    ...(Number.isSafeInteger(evidence.byteCount) && evidence.byteCount >= 0 ? { byteCount: evidence.byteCount } : {}),
    ...(typeof evidence.truncated === "boolean" ? { truncated: evidence.truncated } : {})
  };
  return { ...intervention, contextSummary: { ...context, failureEvidence: safeEvidence } };
}

export function runtimeRunEffects(runDetail: any, attempts: any[]): any[] {
  if (Array.isArray(runDetail?.effects)) return runDetail.effects;
  if (Array.isArray(runDetail?.trace?.effects)) return runDetail.trace.effects;
  return attempts.flatMap((attempt) => (attempt.effects ?? []).map((effect: any) => ({ ...effect, nodeId: effect.nodeId ?? attempt.nodeId, attemptId: attempt.attemptId })));
}

export function runtimeRunStateEvidence(runDetail: any, attempts: any[]): Array<{ id: string; action: string; phase: string; stateRef: string; detail: any }> {
  const evidence: Array<{ id: string; action: string; phase: string; stateRef: string; detail: any }> = [];
  for (const [index, reference] of (runDetail?.startingStateRefs ?? []).entries()) {
    evidence.push({ id: `starting.${index}`, action: "Run", phase: "Starting state", stateRef: String(reference.stateRef ?? reference.snapshotId ?? reference.id ?? "Recorded reference"), detail: reference });
  }
  for (const attempt of attempts) {
    const refs = attempt?.metadata?.stateRefs ?? {};
    for (const [key, label] of [["beforeAction", "Before action"], ["afterAction", "After action"], ["stateDiff", "State diff"]] as const) {
      const detail = refs[key];
      if (!detail) continue;
      evidence.push({ id: `${attempt.attemptId ?? attempt.nodeId}.${key}`, action: String(attempt.nodeId ?? attempt.attemptId ?? "Action"), phase: label, stateRef: String(detail.stateRef ?? detail.stateSnapshotId ?? detail.snapshotId ?? "Recorded evidence"), detail });
    }
  }
  return evidence;
}

