import type { AppInstallationV1 } from "@fluxiq/contracts/apps";

/** Requested choices only. Host authority must approve exactly these grants, target and payer. */
export type AppInstallProposal = Pick<AppInstallationV1, "app" | "approvedGrants" | "target" | "payer">;
