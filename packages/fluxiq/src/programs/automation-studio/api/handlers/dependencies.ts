// The collaborators every endpoint group registers against. The three optional
// ones are written as explicit `| undefined` rather than optional properties so
// the record can be built from `registerAutomationStudioApi`'s own optional
// parameters under exactOptionalPropertyTypes.

import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import type { AutomationStudioClientGatewayBridge } from "../../../../runtime/recording/client-gateway/index.ts";
import type { ClientGatewayService } from "../../../../client-gateway/index.ts";
import type { AutomationStudioRecordingCapturePolicy } from "@fluxiq/contracts/automation";

export type AutomationStudioApiDependencies = {
  readonly registry: GlobalProgramApiRegistry;
  readonly service: AutomationStudioService;
  /**
   * No endpoint group on this record reads this: the PIN for a `destructive`
   * endpoint is taken by `GlobalProgramApiRegistry.call()`, not by a handler.
   * `registerAutomationStudioApi` hands it to the conversation endpoints, whose
   * own record it is on, because only some answers to a question take a PIN.
   */
  readonly identityAccess: IdentityAccessService | undefined;
  readonly clientGatewayBridge: AutomationStudioClientGatewayBridge | undefined;
  readonly clientGateway: ClientGatewayService | undefined;
  /**
   * Where `get-recording-capture-policy` reads a project's policy (null: no
   * project named). Left out, the endpoint answers Core's default,
   * `AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY`, for every project; a
   * per-project policy store is supplied here.
   */
  readonly recordingCapturePolicy?: (projectId: string | null) => Promise<AutomationStudioRecordingCapturePolicy>;
};
