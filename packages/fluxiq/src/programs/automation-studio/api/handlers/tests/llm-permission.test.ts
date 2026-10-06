// The permission request over the wire: a build or run request carries what a
// person allowed as `permittedConsequences`, the service receives it with the
// signed-in caller -- no grant is issued or consulted -- and a build that
// stopped to ask returns the request to the caller intact.

import { describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { AutomationStudioActionPermissionGate, AutomationStudioFlowBootstrapGenerationError } from "../../../runtime/index.ts";
import { registerAutomationStudioApi } from "../index.ts";
import { automationStudioConversationEffectiveCaller } from "../../../runtime/conversations/commands/index.ts";

/** The service's conversations, answering `callerFor` as Core does for a person's own session: unchanged. */
const CONVERSATIONS = { callerFor: (who: { userId: string; sessionId: string }) => automationStudioConversationEffectiveCaller(who, () => null) };

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

function permissionRequiredBuild(request: Awaited<ReturnType<typeof refundRequest>>) {
  return vi.fn().mockRejectedValue(new AutomationStudioFlowBootstrapGenerationError({
    code: "flow_bootstrap.permission_required",
    stage: "provider_output_validation",
    retryable: false,
    providerInvocation: "attempted",
    providerResponse: "received",
    permissionRequest: request
  }));
}

describe("action permissions through the LLM build and run API", () => {
  it("builds with no grant, for the signed-in caller, under the consequences the request allowed", async () => {
    const request = await refundRequest();
    const generateFlowBootstrapAdaptation = permissionRequiredBuild(request);
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any);

    await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
      scope: {},
      actor: ACTOR,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", evidenceGuided: true, permittedConsequences: ["modify_existing", "move_money"] }
    });

    expect(generateFlowBootstrapAdaptation).toHaveBeenCalledWith(expect.objectContaining({
      caller: { actorUserId: "user.one", actorSessionId: "session.one" },
      permittedConsequences: ["move_money", "modify_existing"]
    }));
    expect(generateFlowBootstrapAdaptation.mock.calls[0]?.[0]).not.toHaveProperty("executionGrant");
  });

  // A consequential act with no permission still ends `permission_required`:
  // removing grants removed nothing from the one gate that stays.
  it("returns a build's permission request intact when the act was not permitted", async () => {
    const request = await refundRequest();
    const generateFlowBootstrapAdaptation = permissionRequiredBuild(request);
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any);

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
      scope: {},
      actor: ACTOR,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", evidenceGuided: true }
    });

    expect(generateFlowBootstrapAdaptation).toHaveBeenCalledWith(expect.objectContaining({ permittedConsequences: [] }));
    expect(response).toEqual({
      ok: false,
      error: "Flow Bootstrap generation failed (flow_bootstrap.permission_required).",
      payload: { diagnostic: { code: "flow_bootstrap.permission_required", stage: "provider_output_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received", permissionRequest: request } }
    });
  });

  it("carries a run's permitted consequences to the service beside its model intent", async () => {
    const runRuntimeSession = vi.fn().mockResolvedValue({ runId: "run.one", status: "succeeded" });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { runRuntimeSession, getFlowRunDetail: vi.fn().mockResolvedValue(null), conversations: CONVERSATIONS } as any);

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
      scope: {},
      actor: ACTOR,
      payload: { projectId: "project.one", flowId: "flow.one", runIntent: "explore_and_adapt", permittedConsequences: ["send_or_publish"] }
    });

    expect(response).toMatchObject({ ok: true });
    expect(runRuntimeSession).toHaveBeenCalledWith({
      projectId: "project.one",
      flowId: "flow.one",
      llmExecution: { actorUserId: "user.one", actorSessionId: "session.one", intent: "explore_and_adapt" },
      permittedConsequences: ["send_or_publish"]
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
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any);
      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
        scope: {},
        actor: ACTOR,
        payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", evidenceGuided: true }
      });

      expect(response).toEqual({ ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)." });
    }
  });
});
