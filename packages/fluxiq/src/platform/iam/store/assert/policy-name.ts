import { IAM_POLICY_NAME_PATTERN } from "@fluxiq/contracts/iam";
import { IamStoreError } from "../errors/index.ts";

/** Throws `invalid_name` unless `value` is a valid policy name. */
export function assertPolicyName(value: string): void {
  if (IAM_POLICY_NAME_PATTERN.test(value)) return;
  throw new IamStoreError("invalid_name", `A policy name is a letter then up to 127 letters or digits (got ${JSON.stringify(value)}).`);
}
