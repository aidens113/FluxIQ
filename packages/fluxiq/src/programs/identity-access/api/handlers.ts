import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { IDENTITY_ACCESS_ENDPOINTS } from "./contracts";
import type { IdentityAccessService } from "../runtime/service";

export function registerIdentityAccessApi(registry: GlobalProgramApiRegistry, service: IdentityAccessService): void {
  registry.register({
    programId: "identity-access",
    endpoint: IDENTITY_ACCESS_ENDPOINTS.snapshot,
    handler: () => ({
      ok: true,
      payload: service.snapshot()
    })
  });
}
