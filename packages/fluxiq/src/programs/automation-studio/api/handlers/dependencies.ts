// The collaborators every endpoint group registers against. The four optional
// ones are written as explicit `| undefined` rather than optional properties so
// the record can be built from `registerAutomationStudioApi`'s own optional
// parameters under exactOptionalPropertyTypes.

import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import type { AutomationStudioLlmExecutionGrantService, AutomationStudioService } from "../../runtime/index.ts";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import type { AutomationStudioClientGatewayBridge } from "../../client-gateway/index.ts";
import type { ClientGatewayService } from "../../../../client-gateway/index.ts";

export type AutomationStudioApiDependencies = {
  readonly registry: GlobalProgramApiRegistry;
  readonly service: AutomationStudioService;
  readonly identityAccess: IdentityAccessService | undefined;
  readonly clientGatewayBridge: AutomationStudioClientGatewayBridge | undefined;
  readonly clientGateway: ClientGatewayService | undefined;
  readonly llmExecutionGrants: AutomationStudioLlmExecutionGrantService | undefined;
};
