import type { AppInstallationV1, AppManifestV1, AppOperation } from "@fluxiq/contracts/apps";
import type { AppOperationActor } from "./authority.ts";

/** Checks the actual pinned definition, environment/runtime/callback capabilities and payer eligibility.
 * It must not reserve/debit compute or execute anything. Query resolution never charges compute.
 */
export type AppRegistryTargetCheck = (input: {
  installation: AppInstallationV1;
  manifest: AppManifestV1;
  operation: AppOperation;
  actor: AppOperationActor;
}) => Promise<boolean>;
