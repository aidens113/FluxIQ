import { vi } from "vitest";
import type { WorkspacePresentationHostFacts, WorkspacePresentationInstance, WorkspaceRecordingContextProvider } from "../index";

export const hostFacts: WorkspacePresentationHostFacts = { hostModulePath: "/private/host/module.mjs", clientGatewayPublicUrl: "wss://core.example.test/client", clientGatewayStarted: true, clientGatewayListening: true, clientGatewayError: null };

export function instanceFixture(label = "one") {
  const state = { bound: true, definitions: 4, mappers: 2, evidence: true, tools: 3, provider: true, protection: "host.protection", writeEnabled: true };
  const instance = {
    activeDomainId: `domain.${label}`,
    paths: { root: `/private/${label}/root`, fluxiq: `/private/${label}/root/.fluxiq` },
    programs: { automationStudio: {
      nativeRuntimeSummary: vi.fn((_domainId?: string | null) => ({ bound: state.bound, definitionCount: state.definitions, recordingMapperCount: state.mappers })),
      getFlowBootstrapGenerationRuntimeReadiness: vi.fn(() => ({ providerResolverConfigured: state.provider, nativeNodeRegistryConfigured: state.bound, llmEvidenceRuntime: { bound: state.evidence, toolCount: state.tools }, candidateTrial: { runner: true as const, startReset: false } })),
      reusableLlmContextStatus: vi.fn(() => ({ enabled: true, writeEnabled: state.writeEnabled, contentProtection: state.protection }))
    } }
  } satisfies WorkspacePresentationInstance;
  return { instance, state };
}

export function recordingInput(userId = "user.same", clientId = "client.same", projectId?: string): Parameters<WorkspaceRecordingContextProvider>[0] {
  return {
    session: { sessionId: "session.same", clientId, clientType: "extension", name: "Test browser", status: "ready", connectedAt: 1, lastSeenAt: 1, operatorUserId: userId, capabilities: [] },
    request: { recordingId: "recording.same", ...(projectId ? { projectId } : {}) }
  };
}
