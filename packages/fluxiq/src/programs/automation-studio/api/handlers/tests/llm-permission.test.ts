// The permission request over the wire: a grant request carries what a person
// allowed, the build receives it from the grant, and a build that stopped to
// ask returns the request to the caller intact.

import { describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { AutomationStudioActionPermissionGate, AutomationStudioFlowBootstrapGenerationError } from "../../../runtime/index.ts";
import { registerAutomationStudioApi } from "../index.ts";

const ACTOR: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control", "flows.write"] };

function readyLlmApiService<T extends object>(service: T): T & { getFlowBootstrapGenerationRuntimeReadiness(): { providerResolverConfigured: true; nativeNodeRegistryConfigured: true; llmEvidenceRuntime: { bound: true; toolCount: number } } } {
  return Object.assign({
    getFlowBootstrapGenerationRuntimeReadiness: () => ({ providerResolverConfigured: true as const, nativeNodeRegistryConfigured: true as const, llmEvidenceRuntime: { bound: true as const, toolCount: 1 } })
  }, service);
}

async function refundRequest() {
  const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", instructionIds: ["instruction.one"], now: () => 5, newRequestId: () => "permission-request:one" });
  gate.observe({ controls: [{ handle: "c4", name: "Refund line 1" }] });
  await gate.checkFor({ kind: "flow_step", id: "domain.example.press", ref: "primary.press" })({ consequences: ["move_money"], control: { name: "Refund line 1", kind: "button" }, verb: "press" });
  return gate.request!;
}

describe("action permissions through the LLM execution API", () => {
  it("forwards the classes a person allowed to preflight and to the grant", async () => {
    const grants = {
      preflight: vi.fn().mockResolvedValue({ provider: "deepseek", permittedConsequences: ["move_money"] }),
      issue: vi.fn().mockResolvedValue({ grantId: "llm-grant:one", permittedConsequences: ["move_money"] })
    };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({}) as any, undefined, undefined, undefined, grants as any);
    const request = { keyId: "secret:key", projectId: "project.one", flowId: "flow.one", purpose: "build_and_adapt", permittedConsequences: ["move_money"] };

    await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.preflightLlmExecution, scope: {}, actor: ACTOR, payload: request });
    const issued = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor: ACTOR, payload: { ...request, authSessionId: "session.one" } });

    expect(grants.preflight).toHaveBeenCalledWith(expect.objectContaining({ permittedConsequences: ["move_money"] }));
    expect(grants.issue).toHaveBeenCalledWith(expect.objectContaining({ permittedConsequences: ["move_money"] }));
    expect(issued).toMatchObject({ ok: true, payload: { grant: { permittedConsequences: ["move_money"] } } });
  });

  it("builds under the permission set the grant carries, and returns a build's request intact", async () => {
    const request = await refundRequest();
    const generateFlowBootstrapAdaptation = vi.fn().mockRejectedValue(new AutomationStudioFlowBootstrapGenerationError({
      code: "flow_bootstrap.permission_required",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      permissionRequest: request
    }));
    const grants = {
      inspectAvailable: vi.fn().mockResolvedValue({ grantId: "llm-grant:build", purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 7, permittedConsequences: ["modify_existing"] })
    };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any, undefined, undefined, undefined, grants as any);

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
      scope: {},
      actor: ACTOR,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:build", evidenceGuided: true }
    });

    expect(generateFlowBootstrapAdaptation).toHaveBeenCalledWith(expect.objectContaining({
      executionGrant: expect.objectContaining({ permittedConsequences: ["modify_existing"] })
    }));
    expect(response).toEqual({
      ok: false,
      error: "Flow Bootstrap generation failed (flow_bootstrap.permission_required).",
      payload: { diagnostic: { code: "flow_bootstrap.permission_required", stage: "provider_output_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received", permissionRequest: request } }
    });
  });

  it("does not let a request travel on any other ending, nor that ending travel without one", async () => {
    const request = await refundRequest();
    const cases = [
      { code: "flow_bootstrap.evidence_repeat_without_progress", permissionRequest: request },
      { code: "flow_bootstrap.permission_required" },
      { code: "flow_bootstrap.permission_required", permissionRequest: { ...request, missing: [] } }
    ];
    for (const diagnostic of cases) {
      const generateFlowBootstrapAdaptation = vi.fn().mockRejectedValue(new AutomationStudioFlowBootstrapGenerationError({
        stage: "provider_output_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received", ...diagnostic
      } as never));
      const grants = { inspectAvailable: vi.fn().mockResolvedValue({ grantId: "llm-grant:build", purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 7, permittedConsequences: [] }) };
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any, undefined, undefined, undefined, grants as any);
      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
        scope: {},
        actor: ACTOR,
        payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:build", evidenceGuided: true }
      });

      expect(response).toEqual({ ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)." });
    }
  });
});
