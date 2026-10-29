import { assertSegment } from "../assert/index.ts";
import { removePrincipalState } from "../attachments/remove-principal-state.ts";
import type { IamChangeContext, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import { parsePolicyDocument } from "../parse/index.ts";
import type { IamPolicyStore } from "../policies/index.ts";
import type { IamStoredBoundary, IamStoredRole } from "../records/index.ts";

/** Roles: a trust policy plus the attachments and boundary kept in their own records. */
export class IamRoleStore {
  private readonly scope: IamStoreScope;
  private readonly policies: IamPolicyStore;

  constructor(scope: IamStoreScope, policies: IamPolicyStore) {
    this.scope = scope;
    this.policies = policies;
  }

  /** Creates a role with a trust policy; `options.boundary` names a managed policy of kind `boundary`. */
  async create(name: string, trustPolicy: unknown, context: IamChangeContext, options: { boundary?: string } = {}): Promise<IamStoredRole> {
    assertSegment(name, "A role name");
    if ((await this.get(name)) !== null) throw new IamStoreError("already_exists", `Role ${name} already exists.`);
    const role: IamStoredRole = { name, trustPolicy: parsePolicyDocument(trustPolicy, "trust"), createdAtMs: this.scope.now() };
    if (options.boundary !== undefined) await this.policies.requireKind(options.boundary, "boundary");
    await this.scope.records.put("role", name, role);
    const frn = this.scope.principalFrn("role", name);
    if (options.boundary !== undefined) {
      const boundary: IamStoredBoundary = { principalFrn: frn, policy: options.boundary };
      await this.scope.records.put("boundary", frn, boundary);
    }
    this.scope.audit(context, "iam:CreateRole", [frn]);
    return role;
  }

  async get(name: string): Promise<IamStoredRole | null> {
    return this.scope.records.get<IamStoredRole>("role", name);
  }

  async list(): Promise<IamStoredRole[]> {
    return this.scope.records.list<IamStoredRole>("role");
  }

  async updateTrustPolicy(name: string, trustPolicy: unknown, context: IamChangeContext): Promise<void> {
    const role = await this.require(name);
    await this.scope.records.put("role", name, { ...role, trustPolicy: parsePolicyDocument(trustPolicy, "trust") });
    this.scope.audit(context, "iam:UpdateAssumeRolePolicy", [this.scope.principalFrn("role", name)]);
  }

  async delete(name: string, context: IamChangeContext): Promise<void> {
    await this.require(name);
    const frn = this.scope.principalFrn("role", name);
    await this.scope.records.remove("role", name);
    await removePrincipalState(this.scope, frn);
    this.scope.audit(context, "iam:DeleteRole", [frn]);
  }

  async require(name: string): Promise<IamStoredRole> {
    const role = await this.get(name);
    if (role === null) throw new IamStoreError("not_found", `Role ${name} does not exist.`);
    return role;
  }
}
