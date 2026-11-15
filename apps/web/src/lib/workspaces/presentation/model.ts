import type { FluxIQ } from "fluxiq";
import type { AutomationStudioWebContext } from "../../automation-studio-context";

type Studio = FluxIQ["programs"]["automationStudio"];
export type WorkspacePresentationInstance = {
  readonly activeDomainId?: string | null | undefined;
  readonly paths: Pick<FluxIQ["paths"], "root" | "fluxiq">;
  readonly programs: { readonly automationStudio: Pick<Studio, "nativeRuntimeSummary" | "getFlowBootstrapGenerationRuntimeReadiness" | "reusableLlmContextStatus"> };
};

/** These fields come from an already authorized server caller, never a request body. */
export type WorkspacePresentationCaller = Readonly<{ userId: string; clientId?: string; channel?: "panel" | "paired-client" }>;
export type WorkspaceContextSelection = { activeProjectId: string | null; activeFlowId?: string | null };
export type WorkspacePresentationProfile = "service" | "local" | "self-hosted";
export type WorkspacePresentationBinding = { workspaceId: string; instance: WorkspacePresentationInstance; runtimeId: string; profile: WorkspacePresentationProfile; isCurrent?: () => boolean };
export type WorkspacePresentationHostFacts = {
  hostModulePath: string | null;
  clientGatewayPublicUrl: string | null;
  clientGatewayStarted: boolean;
  clientGatewayListening: boolean;
  clientGatewayError: string | null;
};

export type WorkspaceRuntimePresentation = {
  workspaceId: string;
  runtimeId: string;
  hostModuleLoaded: boolean;
  clientGatewayPublicUrl: string | null;
  clientGatewayStarted: boolean;
  clientGatewayListening: boolean;
  clientGatewayError: string | null;
  hostRoot?: string;
  fluxiqDir?: string;
  hostModulePath?: string | null;
  automationStudio: {
    activeProjectId: string | null;
    activeFlowId: string | null;
    updatedAt: number;
    contextCount: number;
    nativeImporterRuntimeBound: boolean;
    nativeNodeDefinitionCount: number;
    recordingMapperCount: number;
    providerResolverConfigured: boolean;
    nativeNodeRegistryConfigured: boolean;
    llmEvidenceRuntime: { bound: boolean; toolCount: number };
    reusableLlmContext: { enabled: boolean; writeEnabled: boolean; contentProtection: string; blockerCode?: "reusable_context.content_protection_unavailable" };
  };
};

export type WorkspaceRecordingContextProvider = NonNullable<Parameters<FluxIQ["programs"]["automationStudioClientGateway"]["setClientRecordingContextProvider"]>[0]>;
export type WorkspaceContextWrite = Readonly<{ commit(selection: WorkspaceContextSelection): void }>;
export type WorkspaceCallerPresentation = Readonly<{
  context(): AutomationStudioWebContext | undefined;
  present(host: WorkspacePresentationHostFacts): WorkspaceRuntimePresentation;
  beginContextWrite(): WorkspaceContextWrite;
}>;
export interface WorkspacePresentationOwner {
  readonly workspaceId: string;
  readonly runtimeId: string;
  isCurrent(): boolean;
  forCaller(caller: WorkspacePresentationCaller): WorkspaceCallerPresentation;
  operatorStatus(host: WorkspacePresentationHostFacts): WorkspaceRuntimePresentation;
  readonly recordingContextProvider: WorkspaceRecordingContextProvider;
  invalidate(): void;
}
export interface WorkspacePresentations {
  bind(binding: WorkspacePresentationBinding): WorkspacePresentationOwner;
  forInstance(workspaceId: string, instance: WorkspacePresentationInstance): WorkspacePresentationOwner | undefined;
  invalidate(workspaceId: string, instance: WorkspacePresentationInstance): boolean;
  close(): void;
}
