import type { IamPolicyKind } from "./policy/index.ts";

/**
 * One predefined (FluxIQ-managed, read-only, versioned) policy as the contract
 * knows it: its name and kind, and whether provisioning may attach it. The
 * documents themselves are Core's (`packages/fluxiq/src/platform/iam/predefined/`).
 */
export type IamPredefinedPolicy = {
  name: string;
  kind: IamPolicyKind;
  /** One of the user-level policies `createAccount`, `setPolicies` and `addMember` may attach. */
  provisionable: boolean;
};

/**
 * The predefined policies of the plan's table. `FluxIQOwnerFullAccess` is
 * provisionable only in single tenancy; that rule is the provisioning
 * implementation's (`forbidden_policy`), since it depends on the profile.
 */
export const IAM_PREDEFINED_POLICIES: readonly IamPredefinedPolicy[] = Object.freeze([
  Object.freeze({ name: "FluxIQOwnerFullAccess", kind: "identity", provisionable: true }),
  Object.freeze({ name: "FluxIQAdministratorAccess", kind: "identity", provisionable: true }),
  Object.freeze({ name: "FluxIQReadOnlyAccess", kind: "identity", provisionable: true }),
  Object.freeze({ name: "FluxIQUserAccess", kind: "identity", provisionable: true }),
  Object.freeze({ name: "FluxIQBrowserSession", kind: "session", provisionable: false }),
  Object.freeze({ name: "FluxIQProvisioner", kind: "identity", provisionable: false }),
  Object.freeze({ name: "FluxIQServiceGuardrail", kind: "guardrail", provisionable: false })
] satisfies IamPredefinedPolicy[]);

/** The policy-name grammar: a letter, then letters and digits, at most 128 characters. */
export const IAM_POLICY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,127}$/u;

const PROVISIONABLE: ReadonlySet<string> = new Set(IAM_PREDEFINED_POLICIES.filter((policy) => policy.provisionable).map((policy) => policy.name));

/** True for a predefined user-level policy provisioning may attach. */
export function isProvisionablePolicyName(name: string): boolean {
  return PROVISIONABLE.has(name);
}
