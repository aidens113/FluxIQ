// The single entry point consumers see. It owns no endpoint of its own: it
// builds the dependency record once and hands it to each group in the order
// the endpoints were originally registered.

import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import type { AutomationStudioLlmExecutionGrantService, AutomationStudioService } from "../../runtime/index.ts";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import type { AutomationStudioClientGatewayBridge } from "../../client-gateway/index.ts";
import type { ClientGatewayService } from "../../../../client-gateway/index.ts";
import { registerProjectEndpoints } from "./projects.ts";
import { registerCacheEndpoints } from "./caches.ts";
import { registerWorkspaceEndpoints } from "./workspace.ts";
import { registerFlowEndpoints } from "./flows.ts";
import { registerFlowLifecycleEndpoints } from "./flow-lifecycle.ts";
import { registerArtifactEndpoints } from "./artifacts.ts";
import { registerRecordingEndpoints } from "./recordings.ts";
import { registerRuntimeSessionEndpoints } from "./runtime-sessions.ts";
import { registerSubflowEndpoints } from "./subflows.ts";
import { registerInstructionEndpoints } from "./instructions.ts";
import { registerRunEndpoints } from "./runs.ts";
import { registerRouterEndpoints } from "./router.ts";
import { registerLlmGenerationEndpoints } from "./llm-generation.ts";
import { registerRuntimeExecutionEndpoints } from "./runtime-execution.ts";
import { registerClientGatewayEndpoints } from "./client-gateway.ts";

export function registerAutomationStudioApi(registry: GlobalProgramApiRegistry, service: AutomationStudioService, identityAccess?: IdentityAccessService, clientGatewayBridge?: AutomationStudioClientGatewayBridge, clientGateway?: ClientGatewayService, llmExecutionGrants?: AutomationStudioLlmExecutionGrantService): void {
  const dependencies: AutomationStudioApiDependencies = { registry, service, identityAccess, clientGatewayBridge, clientGateway, llmExecutionGrants };
  registerProjectEndpoints(dependencies);
  registerCacheEndpoints(dependencies);
  registerWorkspaceEndpoints(dependencies);
  registerFlowEndpoints(dependencies);
  registerFlowLifecycleEndpoints(dependencies);
  registerArtifactEndpoints(dependencies);
  registerRecordingEndpoints(dependencies);
  registerRuntimeSessionEndpoints(dependencies);
  registerSubflowEndpoints(dependencies);
  registerInstructionEndpoints(dependencies);
  registerRunEndpoints(dependencies);
  registerRouterEndpoints(dependencies);
  registerLlmGenerationEndpoints(dependencies);
  registerRuntimeExecutionEndpoints(dependencies);
  registerClientGatewayEndpoints(dependencies);
}
