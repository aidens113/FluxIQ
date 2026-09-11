// Live LLM work: bootstrap-generation readiness, execution preflight and
// grants, generation instructions, and the generated adaptation itself.

import { AUTOMATION_STUDIO_ENDPOINTS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, type AutomationStudioLlmExecutionGrantRequest, type AutomationStudioLlmExecutionPreflightRequest, type GenerateFlowBootstrapAdaptationRequest, type GenerateFlowBootstrapAdaptationResponse } from "../contracts.ts";
import { parseAutomationStudioFlowBootstrapGenerationError, type AutomationStudioLlmExecutionGrantService, type AutomationStudioService } from "../../runtime/index.ts";
import { boundedWholeNumber } from "./bounded-whole-number.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerLlmGenerationEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, llmExecutionGrants } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowBootstrapGenerationReadiness,
    permission: "programs.read",
    handler: (request) => {
      const payload = request.payload;
      if (payload !== undefined && (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0)) {
        return { ok: false, error: "Flow bootstrap readiness does not accept request fields." };
      }
      return { ok: true, payload: { readiness: flowBootstrapGenerationReadiness(service, llmExecutionGrants) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.preflightLlmExecution,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioLlmExecutionPreflightRequest> & Record<string, unknown> : {};
      if (payload.purpose === "build_and_adapt") {
        const readiness = flowBootstrapGenerationReadiness(service, llmExecutionGrants);
        if (!readiness.supported) return flowBootstrapRuntimeUnavailable(readiness);
      }
      if (!llmExecutionGrants) return { ok: false, error: "LLM execution is unavailable." };
      if (payload.purpose === "build_and_adapt" && hasIncompatibleBuildGrantFlags(payload)) return { ok: false, error: "build_and_adapt grants require a fresh execution session and cannot authorize runtime flags." };
      return { ok: true, payload: { preflight: await llmExecutionGrants.preflight({ keyId: String(payload.keyId ?? ""), projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), purpose: payload.purpose, provider: payload.provider, model: payload.model, tokenLimits: payload.tokenLimits, maxCalls: payload.maxCalls, maxEstimatedCostUsd: payload.maxEstimatedCostUsd, maxTotalEstimatedCostUsd: payload.maxTotalEstimatedCostUsd, timeoutMs: payload.timeoutMs, providerRetryCount: payload.providerRetryCount } as Parameters<AutomationStudioLlmExecutionGrantService["preflight"]>[0]) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant,
    permission: "runtime.control",
    handler: async (request) => {
      if (!request.actor) return { ok: false, error: "LLM execution is unavailable." };
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioLlmExecutionGrantRequest> & Record<string, unknown> : {};
      if (payload.purpose === "build_and_adapt") {
        const readiness = flowBootstrapGenerationReadiness(service, llmExecutionGrants);
        if (!readiness.supported) return flowBootstrapRuntimeUnavailable(readiness);
      }
      if (!llmExecutionGrants) return { ok: false, error: "LLM execution is unavailable." };
      if (payload.authSessionId !== request.actor.sessionId) return { ok: false, error: "Authorization session mismatch." };
      if (payload.purpose === "build_and_adapt" && hasIncompatibleBuildGrantFlags(payload)) return { ok: false, error: "build_and_adapt grants require a fresh execution session and cannot authorize runtime flags." };
      return { ok: true, payload: { grant: await llmExecutionGrants.issue({ actorUserId: request.actor.userId, actorSessionId: request.actor.sessionId, highTokenConfirmation: payload.highTokenConfirmation, keyId: String(payload.keyId ?? ""), projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), purpose: payload.purpose, provider: payload.provider, model: payload.model, tokenLimits: payload.tokenLimits, maxCalls: payload.maxCalls, maxEstimatedCostUsd: payload.maxEstimatedCostUsd, maxTotalEstimatedCostUsd: payload.maxTotalEstimatedCostUsd, timeoutMs: payload.timeoutMs, providerRetryCount: payload.providerRetryCount, ttlMs: payload.ttlMs, maxUses: payload.maxUses } as Parameters<AutomationStudioLlmExecutionGrantService["issue"]>[0]) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowGenerationInstruction,
    permission: "flows.write",
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
    handler: async (request) => {
      if (!request.actor) return { ok: false, error: "Flow bootstrap generation is unavailable." };
      const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload)
        ? request.payload as Partial<GenerateFlowBootstrapAdaptationRequest> & Record<string, unknown>
        : {};
      const unknownField = Object.keys(payload).find((key) => !FLOW_BOOTSTRAP_GENERATION_REQUEST_FIELDS.has(key));
      if (unknownField) return { ok: false, error: "Flow bootstrap generation request contains unsupported fields." };
      if (payload.evidenceGuided !== undefined && payload.evidenceGuided !== true) return { ok: false, error: "Flow bootstrap generation request contains an invalid evidence-guided flag." };
      if (payload.useReusableContext !== undefined && payload.useReusableContext !== true) return { ok: false, error: "Flow bootstrap generation request contains an invalid reusable-context flag." };
      const readiness = flowBootstrapGenerationReadiness(service, llmExecutionGrants);
      if (!readiness.supported) return flowBootstrapRuntimeUnavailable(readiness);
      if (!llmExecutionGrants) return { ok: false, error: "Flow bootstrap generation is unavailable." };

      if (payload.authSessionId !== request.actor.sessionId) return { ok: false, error: "Authorization session mismatch." };
      const projectId = boundedIdentifier(payload.projectId, "Project");
      const flowId = boundedIdentifier(payload.flowId, "Flow");
      const grantId = boundedIdentifier(payload.llmExecutionGrantId, "LLM execution grant");
      const grant = await llmExecutionGrants.inspectAvailable({
        grantId,
        actorUserId: request.actor.userId,
        actorSessionId: request.actor.sessionId,
        projectId,
        flowId,
        purpose: "build_and_adapt"
      });
      if (grant.purpose !== "build_and_adapt" || grant.settingsRevision === undefined) throw new Error("A valid build_and_adapt grant is required.");
      let generated: GenerateFlowBootstrapAdaptationResponse;
      try {
        generated = await service.generateFlowBootstrapAdaptation({
          projectId,
          flowId,
          executionGrant: {
            grantId,
            actorUserId: request.actor.userId,
            actorSessionId: request.actor.sessionId,
            purpose: "build_and_adapt",
            executionDigest: grant.executionDigest,
            settingsRevision: grant.settingsRevision
          },
          ...(payload.evidenceGuided === true ? { evidenceGuided: true as const } : {}),
          ...(payload.useReusableContext === true ? { useReusableContext: true as const } : {})
        });
      } catch (error) {
        const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
        if (diagnostic) {
          return {
            ok: false,
            error: `Flow Bootstrap generation failed (${diagnostic.code}).`,
            payload: { diagnostic }
          };
        }
        return { ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)." };
      }
      return { ok: true, payload: { adaptation: sanitizedFlowBootstrapGeneration(generated) } };
    }
  });
}

const FLOW_BOOTSTRAP_GENERATION_REQUEST_FIELDS = new Set([
  "projectId",
  "flowId",
  "llmExecutionGrantId",
  "authSessionId",
  "evidenceGuided",
  "useReusableContext"
]);

function flowBootstrapGenerationReadiness(
  service: AutomationStudioService,
  llmExecutionGrants: AutomationStudioLlmExecutionGrantService | undefined
) {
  const runtime = service.getFlowBootstrapGenerationRuntimeReadiness();
  const readiness = structuredClone(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS);
  readiness.runtime = {
    llmExecutionGrantsConfigured: Boolean(llmExecutionGrants),
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
  if (status !== "proposed") throw new Error("Flow bootstrap generation returned an invalid status.");
  if (!["low", "medium", "high", "destructive"].includes(value.riskLevel)) throw new Error("Flow bootstrap generation returned an invalid risk level.");
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
  return {
    projectId: boundedIdentifier(value.projectId, "Project"),
    flowId: boundedIdentifier(value.flowId, "Flow"),
    adaptationId: boundedIdentifier(value.adaptationId, "Adaptation"),
    status,
    riskLevel: value.riskLevel,
    sourceInstructionIds,
    baseDependencyDigest: boundedIdentifier(value.baseDependencyDigest, "Dependency digest"),
    baseSettingsRevision: boundedWholeNumber(value.baseSettingsRevision, 0, Number.MAX_SAFE_INTEGER),
    accounting: sanitizedAccounting
  };
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
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 50_000) throw new Error(`Flow bootstrap generation ${label} are invalid.`);
  return value as number;
}

function boundedAccountingCost(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) throw new Error("Flow bootstrap generation cost accounting is invalid.");
  return value;
}

const BUILD_GRANT_INCOMPATIBLE_FLAGS = [
  "runId",
  "runtimeSessionId",
  "idempotencyKey",
  "runIntent",
  "llmExecutionGrantId",
  "adaptiveMode",
  "dryRunLlm",
  "authorizedExternalSideEffects"
] as const;

function hasIncompatibleBuildGrantFlags(payload: Record<string, unknown>): boolean {
  return BUILD_GRANT_INCOMPATIBLE_FLAGS.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
}
