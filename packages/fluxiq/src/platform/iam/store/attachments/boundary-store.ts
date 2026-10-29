import type { IamChangeContext, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import type { IamPolicyStore } from "../policies/index.ts";
import { principalTypeLabel, requirePrincipal } from "../principals/index.ts";
import type { IamStoredBoundary } from "../records/index.ts";

/** Permission boundaries of users and roles. */
export class IamBoundaryStore {
  private readonly scope: IamStoreScope;
  private readonly policies: IamPolicyStore;

  constructor(scope: IamStoreScope, policies: IamPolicyStore) {
    this.scope = scope;
    this.policies = policies;
  }

  /** Sets (or, with `policyName` null, removes) a user's or role's permission boundary, a managed policy of kind `boundary`. */
  async set(principalFrn: string, policyName: string | null, context: IamChangeContext): Promise<void> {
    const principal = await requirePrincipal(this.scope, principalFrn);
    if (principal.type !== "user" && principal.type !== "role") {
      throw new IamStoreError("invalid_principal", `Only a user or a role has a permission boundary (got ${principalFrn}).`);
    }
    const label = principalTypeLabel(principal.type);
    if (policyName === null) {
      await this.scope.records.remove("boundary", principalFrn);
      this.scope.audit(context, `iam:Delete${label}PermissionsBoundary`, [principalFrn]);
      return;
    }
    await this.policies.requireKind(policyName, "boundary");
    const record: IamStoredBoundary = { principalFrn, policy: policyName };
    await this.scope.records.put("boundary", principalFrn, record);
    this.scope.audit(context, `iam:Put${label}PermissionsBoundary`, [principalFrn, this.scope.policyFrn(policyName)]);
  }

  async get(principalFrn: string): Promise<string | null> {
    const record = await this.scope.records.get<IamStoredBoundary>("boundary", principalFrn);
    return record?.policy ?? null;
  }
}
