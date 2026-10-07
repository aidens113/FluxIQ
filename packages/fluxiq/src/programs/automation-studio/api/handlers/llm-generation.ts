// Live LLM work: bootstrap-generation readiness, generation instructions, and
// the generated adaptation itself. A build's model calls need no grant: the
// build runs for the signed-in actor, whose unlocked Secret Keys key pays, and
// only a lasting consequence of one of its actions is asked about
// (`permittedConsequences`).

import { resolveAutomationStudioAuthoringMode } from "../../model/authoring-mode/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS } from "../../runtime/loop-limits/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, type GenerateFlowBootstrapAdaptationRequest, type GenerateFlowBootstrapAdaptationResponse } from "../contracts.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS, automationStudioFlowBootstrapFailedBuilds, automationStudioFlowStartLocation, parseAutomationStudioFlowBootstrapGenerationError, parseAutomationStudioPermittedConsequences, type AutomationStudioActionConsequence, type AutomationStudioCandidateDraftTrial, type AutomationStudioGeneratedCandidateTrial, type AutomationStudioService } from "../../runtime/index.ts";
import { boundedWholeNumber } from "./bounded-whole-number.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerLlmGenerationEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  const failedBuilds = automationStudioFlowBootstrapFailedBuilds<NonNullable<ReturnType<typeof parseAutomationStudioFlowBootstrapGenerationError>>>();
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.cancelFlowBootstrap,
    permission: "runtime.control", classification: "authoring",
    handler: (request) => {
      const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Record<string, unknown> : {};
      const projectId = boundedIdentifier(payload.projectId, "Project"), flowId = boundedIdentifier(payload.flowId, "Flow");
      return { ok: true, payload: { projectId, flowId, cancellationRequested: service.buildCancellation.cancel(projectId, flowId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowBootstrapGenerationReadiness,
    permission: "programs.read",
    classification: "read",
    handler: (request) => {
      const payload = request.payload;
      if (payload !== undefined && (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0)) {
        return { ok: false, error: "Flow bootstrap readiness does not accept request fields." };
      }
      return { ok: true, payload: { readiness: flowBootstrapGenerationReadiness(service) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowGenerationInstruction,
    permission: "flows.write",
    classification: "authoring",
    handler: async (request) => {
      if (!request.actor) return { ok: false, error: "Flow generation instruction is unavailable." };
      const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload)
        ? request.payload as Record<string, unknown> : {};
      if (Object.keys(payload).some((key) => !["projectId", "flowId", "authSessionId", "instruction"].includes(key))) return { ok: false, error: "Flow generation instruction request contains unsupported fields." };
      if (payload.authSessionId !== request.actor.sessionId) return { ok: false, error: "Authorization session mismatch." };
      const instruction = typeof payload.instruction === "string" ? payload.instruction.trim() : "";
      if (!instruction || instruction.length > 4_000) return { ok: false, error: "Flow generation instruction must contain 1 to 4,000 characters." };
      const saved = await service.saveFlowGenerationInstruction({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), instruction });
      return { ok: true, payload: { instruction: { instructionId: saved.instructionId, status: saved.status, updatedAt: saved.updatedAt } } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
    permission: "flows.write",
    classification: "authoring",
    handler: async (request) => {
      if (!request.actor) return { ok: false, error: "Flow bootstrap generation is unavailable." };
      const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload)
        ? request.payload as Partial<GenerateFlowBootstrapAdaptationRequest> & Record<string, unknown>
        : {};
      const unknownField = Object.keys(payload).find((key) => !FLOW_BOOTSTRAP_GENERATION_REQUEST_FIELDS.has(key));
      if (unknownField) return { ok: false, error: "Flow bootstrap generation request contains unsupported fields." };
      if (payload.evidenceGuided !== undefined && payload.evidenceGuided !== true) return { ok: false, error: "Flow bootstrap generation request contains an invalid evidence-guided flag." };
      if (payload.authoringMode !== undefined && ((payload.authoringMode !== "candidate" && payload.authoringMode !== "configured") || payload.evidenceGuided !== true)) return { ok: false, error: "Candidate authoring requires evidence-guided generation." };
      // `configured` is how a client that cannot read Core's configuration
      // (the web panel) asks for Core's own authoring mode
      // (`../../model/authoring-mode/`); it is resolved here, once, so the build
      // and the answer below agree on it.
      let candidateAuthoring: boolean;
      try { candidateAuthoring = payload.authoringMode === "candidate" || (payload.authoringMode === "configured" && resolveAutomationStudioAuthoringMode() === "candidate"); }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Core's authoring mode is misconfigured." }; }
      if (payload.useReusableContext !== undefined && payload.useReusableContext !== true) return { ok: false, error: "Flow bootstrap generation request contains an invalid reusable-context flag." };
      // `extend` improves the Flow as it stands instead of writing one from
      // nothing. Only the two words Core knows pass; absent is `create`, which
      // is what every caller that predates the field has always meant.
      if (payload.mode !== undefined && payload.mode !== "create" && payload.mode !== "extend") return { ok: false, error: "Flow bootstrap generation request contains an invalid mode." };
      // Refused here rather than carried: a build that lost the one thing
      // telling it where its Flow starts would explore from nowhere.
      let startLocation: string | undefined;
      try { startLocation = automationStudioFlowStartLocation(payload.startLocation); }
      catch { return { ok: false, error: "Flow bootstrap generation request contains an invalid start location." }; }
      // What the chat's reading of the message cost, carried into the Flow's
      // creation purse. Only a finite, non-negative amount passes.
      const interpretationCostUsd = payload.interpretationCostUsd;
      if (interpretationCostUsd !== undefined && (typeof interpretationCostUsd !== "number" || !Number.isFinite(interpretationCostUsd) || interpretationCostUsd < 0)) return { ok: false, error: "Flow bootstrap generation request contains an invalid interpretation cost." };
      const readiness = flowBootstrapGenerationReadiness(service);
      if (!readiness.supported) return flowBootstrapRuntimeUnavailable(readiness);
      // What the person allowed the build's actions to do. Absent is nothing;
      // a class Core does not know refuses the request rather than being
      // dropped, so a build never runs holding less than was asked for.
      let permittedConsequences: AutomationStudioActionConsequence[];
      try { permittedConsequences = parseAutomationStudioPermittedConsequences(payload.permittedConsequences); }
      catch { return { ok: false, error: "Flow bootstrap generation request contains invalid permitted consequences." }; }
      if (payload.authSessionId !== request.actor.sessionId) return { ok: false, error: "Authorization session mismatch." };
      const projectId = boundedIdentifier(payload.projectId, "Project");
      const flowId = boundedIdentifier(payload.flowId, "Flow");
      let generated: GenerateFlowBootstrapAdaptationResponse;
      try {
        generated = await service.generateFlowBootstrapAdaptation({
          projectId,
          flowId,
          // Whose key pays for the build's model calls. Not an authorization.
          caller: { actorUserId: request.actor.userId, actorSessionId: request.actor.sessionId },
          // A build that meets an act outside these asks the person; empty
          // permits nothing lasting.
          permittedConsequences,
          ...(payload.evidenceGuided === true ? { evidenceGuided: true as const } : {}),
          ...(candidateAuthoring ? { authoringMode: "candidate" as const } : {}),
          ...(payload.useReusableContext === true ? { useReusableContext: true as const } : {}),
          ...(payload.mode === "extend" ? { mode: "extend" as const } : {}),
          // Where the Flow starts, when the caller named one. Validated above,
          // so a request that named an unusable one was already refused rather
          // than built from nowhere.
          ...(startLocation === undefined ? {} : { startLocation }),
          ...(interpretationCostUsd === undefined ? {} : { interpretationCostUsd }),
          // Somebody has just pressed build, so a question this build raises is
          // worth holding it open for: answered, the build carries on with
          // permission instead of coming back needing another one.
          permissionAskTimeoutMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS
        });
      } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") {
          const diagnostic = parseAutomationStudioFlowBootstrapGenerationError((error as { cause?: unknown }).cause);
          failedBuilds.ended(projectId, flowId, diagnostic ?? undefined);
          return { ok: false, error: "Build stopped. The Flow was not promoted.", payload: { cancelled: true, ...(diagnostic ? { diagnostic } : {}) } };
        }
        const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
        failedBuilds.ended(projectId, flowId, diagnostic ?? undefined);
        if (diagnostic) {
          return {
            ok: false,
            error: `Flow Bootstrap generation failed (${diagnostic.code}).`,
            payload: { diagnostic }
          };
        }
        return { ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)." };
      }
      failedBuilds.ended(projectId, flowId, undefined);
      // Candidate mode ends as a draft or, after a trial judged yes twice, as a proposal naming that candidate and trial (t340); legacy mode only ever proposes, and never names a candidate.
      const consistent = candidateAuthoring ? generated.status === "draft" || generated.candidate !== undefined : generated.status === "proposed" && generated.candidate === undefined;
      if (!consistent) return { ok: false, error: "Flow bootstrap generation returned a status inconsistent with the requested authoring mode." };
      const sanitized = sanitizedFlowBootstrapGeneration(generated);
      return { ok: true, payload: sanitized.status === "draft" ? { candidate: sanitized } : { adaptation: sanitized } };
    }
  });
  // The diagnostic of a Flow's latest build that failed, as the request above
  // answered it. A build the chat started answers the person in words, and
  // what it spent used to be lost with the rest of its diagnostic: live run
  // `run-muq3ubys-4b4dbf5b` spent $0.227 and the spend ledger recorded $0.
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowBootstrapFailure,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Record<string, unknown> : {};
      return { ok: true, payload: { failure: failedBuilds.latest(boundedIdentifier(payload.projectId, "Project"), boundedIdentifier(payload.flowId, "Flow")) ?? null } };
    }
  });
}

const FLOW_BOOTSTRAP_GENERATION_REQUEST_FIELDS = new Set([
  "projectId",
  "flowId",
  "authSessionId",
  "permittedConsequences",
  "evidenceGuided",
  "authoringMode",
  "useReusableContext",
  "startLocation",
  "mode",
  "interpretationCostUsd"
]);

function flowBootstrapGenerationReadiness(service: AutomationStudioService) {
  const runtime = service.getFlowBootstrapGenerationRuntimeReadiness();
  const readiness = structuredClone(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS);
  readiness.runtime = {
    providerResolverConfigured: runtime.providerResolverConfigured,
    nativeNodeRegistryConfigured: runtime.nativeNodeRegistryConfigured
  };
  readiness.supported = Object.values(readiness.runtime).every((configured) => configured === true);
  return readiness;
}

function flowBootstrapRuntimeUnavailable(readiness: ReturnType<typeof flowBootstrapGenerationReadiness>) {
  return { ok: false, error: "Flow bootstrap generation runtime is unavailable.", payload: { readiness } } as const;
}

function sanitizedFlowBootstrapGeneration(value: GenerateFlowBootstrapAdaptationResponse): GenerateFlowBootstrapAdaptationResponse {
  const status = value.status;
  if (status !== "proposed" && status !== "draft") throw new Error("Flow bootstrap generation returned an invalid status.");
  if (status === "proposed" && !["low", "medium", "high", "destructive"].includes(value.riskLevel)) throw new Error("Flow bootstrap generation returned an invalid risk level.");
  if (!Array.isArray(value.sourceInstructionIds) || value.sourceInstructionIds.length > 100) throw new Error("Flow bootstrap generation returned invalid instruction references.");
  const sourceInstructionIds = value.sourceInstructionIds.map((id) => boundedIdentifier(id, "Instruction"));
  const accounting = value.accounting;
  if (!accounting || typeof accounting !== "object") throw new Error("Flow bootstrap generation accounting is missing.");
  const sanitizedAccounting: GenerateFlowBootstrapAdaptationResponse["accounting"] = {
    requestId: boundedIdentifier(accounting.requestId, "LLM request"),
    estimatedInputTokens: boundedAccountingInteger(accounting.estimatedInputTokens, "estimated input tokens"),
    ...(accounting.provider !== undefined ? { provider: boundedLabel(accounting.provider, "LLM provider") } : {}),
    ...(accounting.model !== undefined ? { model: boundedLabel(accounting.model, "LLM model") } : {}),
    ...(accounting.inputTokens !== undefined ? { inputTokens: boundedAccountingInteger(accounting.inputTokens, "input tokens") } : {}),
    ...(accounting.outputTokens !== undefined ? { outputTokens: boundedAccountingInteger(accounting.outputTokens, "output tokens") } : {}),
    ...(accounting.totalTokens !== undefined ? { totalTokens: boundedAccountingInteger(accounting.totalTokens, "total tokens") } : {}),
    ...(accounting.estimatedCostUsd !== undefined ? { estimatedCostUsd: boundedAccountingCost(accounting.estimatedCostUsd) } : {})
  };
  const common = {
    projectId: boundedIdentifier(value.projectId, "Project"),
    flowId: boundedIdentifier(value.flowId, "Flow"),
    sourceInstructionIds,
    baseDependencyDigest: boundedIdentifier(value.baseDependencyDigest, "Dependency digest"),
    baseSettingsRevision: boundedWholeNumber(value.baseSettingsRevision, 0, Number.MAX_SAFE_INTEGER),
    accounting: sanitizedAccounting
  };
  if (value.status === "draft") {
    if (value.verification !== "not_performed" || value.promotionAllowed !== false || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest)) throw new Error("Flow candidate draft returned invalid verification or identity.");
    return { ...common, status: "draft", candidateId: boundedIdentifier(value.candidateId, "Candidate"), revision: value.revision, digest: value.digest, verification: "not_performed", promotionAllowed: false, ...(value.trial ? { trial: sanitizedDraftTrial(value.trial) } : {}) };
  }
  return {
    ...common, status: "proposed", adaptationId: boundedIdentifier(value.adaptationId, "Adaptation"), riskLevel: value.riskLevel,
    // Carried whole, like the same request on the failure diagnostic beside it:
    // it is Core's own object, built by Core's gate from Core's own words, and
    // a field-by-field copy here would be a second place to keep in step with
    // the request type. A build that finished carrying one cannot be applied
    // until it is answered, so the caller has to be able to show it.
    ...(value.permissionRequest ? { permissionRequest: value.permissionRequest } : {}),
    // Which candidate and trial run's confirmed yes made a candidate-mode proposal (t340); the chat applies a candidate's proposal only with it.
    ...(value.candidate ? { candidate: sanitizedProposalCandidate(value.candidate) } : {})
  };
}

const DRAFT_TRIAL_VERDICTS: ReadonlySet<string> = new Set(["yes", "no", "unsure", "not_judged", "execution_failed", "not_tested"]);

/** A draft's trial block, field by field: a known verdict, a bounded run id and at most twenty bounded codes. */
function sanitizedDraftTrial(trial: AutomationStudioCandidateDraftTrial): AutomationStudioCandidateDraftTrial {
  if (!DRAFT_TRIAL_VERDICTS.has(trial.verdict) || !Array.isArray(trial.codes) || trial.codes.length > 20) throw new Error("Flow candidate draft returned an invalid trial outcome.");
  return { verdict: trial.verdict, ...(trial.runId !== undefined ? { runId: boundedIdentifier(trial.runId, "Trial run") } : {}), codes: trial.codes.map((code) => boundedIdentifier(code, "Trial code")) };
}

/** A proposal's candidate block, field by field; a yes stands only after a confirming call, so two calls at least (t296). */
function sanitizedProposalCandidate(candidate: AutomationStudioGeneratedCandidateTrial): AutomationStudioGeneratedCandidateTrial {
  if (!Number.isSafeInteger(candidate.revision) || candidate.revision < 1 || typeof candidate.digest !== "string" || !/^[a-f0-9]{64}$/.test(candidate.digest)
    || candidate.trial?.verdict !== "yes" || !Number.isSafeInteger(candidate.trial.calls) || candidate.trial.calls < 2) throw new Error("Flow candidate proposal returned an invalid candidate trial.");
  return { candidateId: boundedIdentifier(candidate.candidateId, "Candidate"), revision: candidate.revision, digest: candidate.digest, trial: { runId: boundedIdentifier(candidate.trial.runId, "Trial run"), verdict: "yes", calls: candidate.trial.calls } };
}

function boundedIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} identifier is required.`);
  const clean = value.trim();
  if (!clean || clean.length > 200 || /[\u0000-\u001f\u007f]/.test(clean)) throw new Error(`${label} identifier is invalid.`);
  return clean;
}

function boundedLabel(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const clean = value.trim();
  if (!clean || clean.length > 100 || /[\u0000-\u001f\u007f]/.test(clean)) throw new Error(`${label} is invalid.`);
  return clean;
}

function boundedAccountingInteger(value: unknown, label: string): number {
  // A build's totals, not one request's: an evidence-guided build adds up
  // every call it made, so it is bounded as the service and the failure
  // diagnostic bound it. One request's ceiling refused any build longer than
  // a few calls after its proposal was stored, and answered it with a bare
  // failure that carried no diagnostic.
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS) throw new Error(`Flow bootstrap generation ${label} are invalid.`);
  return value as number;
}

function boundedAccountingCost(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) throw new Error("Flow bootstrap generation cost accounting is invalid.");
  return value;
}
