import { FRN_SEGMENT_PATTERN } from "@fluxiq/contracts/iam";
import { IamStoreError } from "../errors/index.ts";

/** Throws `invalid_name` unless `value` is a valid identifier segment (a user id, group, role or service-identity name). */
export function assertSegment(value: string, what: string): void {
  if (FRN_SEGMENT_PATTERN.test(value)) return;
  throw new IamStoreError("invalid_name", `${what} must be 1 to 128 letters, digits or ._~@+=,- (got ${JSON.stringify(value)}).`);
}
