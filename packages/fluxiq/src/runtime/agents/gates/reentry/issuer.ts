import type { GateReentryPermit } from "./permit.ts";

export interface GateReentryIssuer {
  issue(completedProof: object): GateReentryPermit | undefined;
  invalidate(gate: object): void;
  dispose(): void;
}
