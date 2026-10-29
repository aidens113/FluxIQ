import { IAM_PREDEFINED_POLICIES } from "@fluxiq/contracts/iam";
import { IamStoreError } from "../errors/index.ts";

/** Throws `reserved_policy_name` for a predefined policy name: those belong to FluxIQ and are read-only here. */
export function assertNotPredefined(name: string): void {
  if (!IAM_PREDEFINED_POLICIES.some((policy) => policy.name === name)) return;
  throw new IamStoreError("reserved_policy_name", `${name} is a predefined FluxIQ policy; it cannot be created, changed or deleted.`);
}
