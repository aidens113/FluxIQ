import type { AutomationStudioWebContext } from "../../automation-studio-context";
import type { WorkspacePresentationBinding, WorkspacePresentationHostFacts, WorkspaceRuntimePresentation } from "./model";
import { workspacePresentationReadiness } from "./readiness";

export function workspaceRuntimePresentation(binding: WorkspacePresentationBinding, host: WorkspacePresentationHostFacts, context: AutomationStudioWebContext | undefined, contextCount: number, channel: "panel" | "paired-client" = "panel"): WorkspaceRuntimePresentation {
  const restricted = binding.profile === "service" || channel === "paired-client";
  return {
    workspaceId: binding.workspaceId,
    runtimeId: binding.runtimeId,
    ...(restricted ? {} : { hostRoot: binding.instance.paths.root, fluxiqDir: binding.instance.paths.fluxiq, hostModulePath: host.hostModulePath }),
    hostModuleLoaded: Boolean(host.hostModulePath),
    clientGatewayPublicUrl: host.clientGatewayPublicUrl,
    clientGatewayStarted: host.clientGatewayStarted,
    clientGatewayListening: host.clientGatewayListening,
    clientGatewayError: restricted && host.clientGatewayError ? "Client gateway is unavailable." : host.clientGatewayError,
    automationStudio: {
      activeProjectId: context?.activeProjectId ?? null,
      activeFlowId: context?.activeFlowId ?? null,
      updatedAt: context?.updatedAt ?? 0,
      contextCount,
      ...workspacePresentationReadiness(binding.instance, restricted ? "service" : binding.profile)
    }
  };
}
