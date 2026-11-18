import type { CloudAdmissionService, CommerceBillingService } from "fluxiq/platform";

export type CommerceComposition = { service: CommerceBillingService; admission: CloudAdmissionService<unknown>; stop(): void };
const state = globalThis as typeof globalThis & { __fluxiqCommerceBilling?: Map<string, Promise<CommerceComposition>> };

/** Shared across separately bundled Next routes; keyed by the FluxIQ root and the configuration file. */
export const commerceCompositions = state.__fluxiqCommerceBilling ??= new Map<string, Promise<CommerceComposition>>();
