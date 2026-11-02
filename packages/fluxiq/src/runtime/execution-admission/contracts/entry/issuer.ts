import type { ExecutionEntryGrant } from "./grant.ts";

export interface ExecutionEntryIssuer {
  fromOrdinaryAdmission(proof: object): ExecutionEntryGrant;
}
