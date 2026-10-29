import { isProvisionablePolicyName } from "@fluxiq/contracts/iam";
import { resolveIamPredefinedPolicy } from "../../iam/index.ts";
import { ProvisioningRefusal } from "../context/index.ts";
import type { PlatformTenancy } from "../context/index.ts";
import { policyGrantsPlatformAccess } from "./grants-platform-access.ts";

const OWNER_POLICY = "FluxIQOwnerFullAccess";

/**
 * The policies provisioning may attach, de-duplicated in order, or
 * `forbidden_policy`: a name outside the provisionable predefined set, one
 * granting `platform:` access, or `FluxIQOwnerFullAccess` outside single
 * tenancy or over HTTP (the owner is claimed in-process only).
 */
export function checkProvisioningPolicies(names: readonly string[], tenancy: PlatformTenancy, transport: "http" | "in-process", nowMs: number): string[] {
  const unique = [...new Set(names)];
  for (const name of unique) {
    if (!isProvisionablePolicyName(name)) throw new ProvisioningRefusal("forbidden_policy", `${name} is not a provisionable predefined policy.`);
    const policy = resolveIamPredefinedPolicy(name);
    if (policy === null || policyGrantsPlatformAccess(policy, nowMs)) throw new ProvisioningRefusal("forbidden_policy", `${name} grants platform access, which provisioning never attaches.`);
    if (name === OWNER_POLICY && (tenancy.mode !== "single" || transport === "http")) {
      throw new ProvisioningRefusal("forbidden_policy", `${OWNER_POLICY} is attached only in single tenancy, and only in-process.`);
    }
  }
  return unique;
}
