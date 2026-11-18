import type { CommerceBillingService } from "fluxiq/platform";

type Composition = { service: CommerceBillingService; stop(): void };
const state = globalThis as typeof globalThis & { __fluxiqCommerceBilling?: Map<string, Promise<Composition>> };

/** Shared across separately bundled Next routes; keyed by the FluxIQ root and the configuration file. */
export const commerceCompositions = state.__fluxiqCommerceBilling ??= new Map<string, Promise<Composition>>();
