// The collaborators every endpoint group registers against. The three optional
// ones are written as explicit `| undefined` rather than optional properties so
// the record can be built from `registerAutomationStudioApi`'s own optional
// parameters under exactOptionalPropertyTypes.

import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import type { AutomationStudioService } from "../../runtime/index.ts";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import type { AutomationStudioClientGatewayBridge } from "../../client-gateway/index.ts";
import type { ClientGatewayService } from "../../../../client-gateway/index.ts";
import type { AutomationStudioRecordingCapturePolicy } from "@fluxiq/contracts/automation-studio";

export type AutomationStudioApiDependencies = {
  readonly registry: GlobalProgramApiRegistry;
  readonly service: AutomationStudioService;
  /**
   * No endpoint group reads this any more: the PIN for a `destructive`
   * endpoint is taken by `GlobalProgramApiRegistry.call()`, not by a handler.
   * It stays on the record because `registerAutomationStudioApi` accepts it as
   * a positional parameter, and dropping that parameter would renumber every
   * caller. Remove both together.
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
