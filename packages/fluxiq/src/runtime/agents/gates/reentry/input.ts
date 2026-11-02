import type { GateReentryBinding } from "./binding.ts";

export interface GateReentryAuthorityInput {
  readonly scope: object;
  readCompleted(proof: object): GateReentryBinding | null;
}
