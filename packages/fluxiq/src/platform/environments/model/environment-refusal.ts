import type { CommerceAdmissionDenial } from "../../commerce/index.ts";

export type EnvironmentRefusalCode =
  | "invalid-request"
  | "not-authorized"
  | "not-dedicated"
  | "admission-refused"
  | "not-found"
  | "operation-reused"
  | "environment-exists"
  | "environment-deleted"
  | "owned-elsewhere"
  | "driver-mismatch";

/**
 * A dedicated-environment operation was refused before anything changed: no
 * record was written and no driver was called. `admission` carries the
 * commerce admission's own reason when `code` is `admission-refused`.
 */
export class EnvironmentRefusal extends Error {
  readonly admission: CommerceAdmissionDenial | null;

  constructor(readonly code: EnvironmentRefusalCode, admission: CommerceAdmissionDenial | null = null) {
    super(admission === null ? `Environment refused: ${code}` : `Environment refused: ${code} (${admission})`);
    this.name = "EnvironmentRefusal";
    this.admission = admission;
  }
}
