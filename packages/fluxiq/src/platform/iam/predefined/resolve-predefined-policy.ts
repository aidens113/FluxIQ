import type { IamPolicy } from "../types.ts";
import { IAM_PREDEFINED_POLICY_DEFINITIONS } from "./predefined-policies.ts";

const BY_NAME: ReadonlyMap<string, IamPolicy> = new Map(IAM_PREDEFINED_POLICY_DEFINITIONS.map((policy) => [policy.name, policy]));

/**
 * The predefined policy of this exact name (case-sensitive, as policy names
 * are), or null for any other name. The result is frozen and shared; it is
 * what the store's `resolveManagedPolicy` hands the evaluator.
 */
export function resolveIamPredefinedPolicy(name: string): IamPolicy | null {
  return BY_NAME.get(name) ?? null;
}
