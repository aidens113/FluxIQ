import type { AppInstallationV1 } from "@fluxiq/contracts/apps";

/** Immutable consent/configuration history; it contains metadata, never invocation inputs. */
export type AppInstallationRevision = {
  installation: AppInstallationV1;
  actorUserId: string;
  recordedAtMs: number;
};
