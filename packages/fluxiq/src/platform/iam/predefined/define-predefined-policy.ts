import { IAM_POLICY_LANGUAGE_VERSION, IAM_PREDEFINED_POLICIES, parseIamPolicyDocument } from "@fluxiq/contracts/iam";
import type { IamPredefinedPolicyDefinition } from "./predefined-policy-definition.ts";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Builds one predefined policy at module load. The name must be one of the
 * contract's `IAM_PREDEFINED_POLICIES`, whose entry supplies the kind, so a
 * document can never be checked against a different kind than the one the
 * store and provisioning expect. The document is checked with
 * `parseIamPolicyDocument(document, kind)` and the module throws on any
 * refusal: a predefined policy the grammar would refuse never loads, rather
 * than failing at the first request that attaches it. The parsed result is
 * frozen to the leaves.
 */
export function defineIamPredefinedPolicy(name: string, version: string, statements: readonly unknown[]): IamPredefinedPolicyDefinition {
  const contract = IAM_PREDEFINED_POLICIES.find((policy) => policy.name === name);
  if (contract === undefined) throw new TypeError(`${name} is not a predefined policy in the contract (IAM_PREDEFINED_POLICIES).`);
  const parsed = parseIamPolicyDocument({ Version: IAM_POLICY_LANGUAGE_VERSION, Id: `${name}.${version}`, Statement: statements }, contract.kind);
  if (!parsed.success) throw new TypeError(`Predefined policy ${name} ${version} is not a valid ${contract.kind} policy: ${JSON.stringify(parsed.error.issues)}`);
  return deepFreeze({ name, kind: contract.kind, version, document: parsed.data });
}
