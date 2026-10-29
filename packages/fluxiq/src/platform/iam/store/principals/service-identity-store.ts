import { assertSegment } from "../assert/index.ts";
import { removePrincipalState } from "../attachments/remove-principal-state.ts";
import type { IamChangeContext, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import type { IamStoredServiceIdentity } from "../records/index.ts";

/** Service identities: named non-human principals. */
export class IamServiceIdentityStore {
  private readonly scope: IamStoreScope;

  constructor(scope: IamStoreScope) {
    this.scope = scope;
  }

  async create(name: string, context: IamChangeContext): Promise<IamStoredServiceIdentity> {
    assertSegment(name, "A service-identity name");
    if ((await this.get(name)) !== null) throw new IamStoreError("already_exists", `Service identity ${name} already exists.`);
    const identity: IamStoredServiceIdentity = { name, createdAtMs: this.scope.now() };
    await this.scope.records.put("service-identity", name, identity);
    this.scope.audit(context, "iam:CreateServiceIdentity", [this.scope.principalFrn("service-identity", name)]);
    return identity;
  }

  async get(name: string): Promise<IamStoredServiceIdentity | null> {
    return this.scope.records.get<IamStoredServiceIdentity>("service-identity", name);
  }

  async list(): Promise<IamStoredServiceIdentity[]> {
    return this.scope.records.list<IamStoredServiceIdentity>("service-identity");
  }

  async delete(name: string, context: IamChangeContext): Promise<void> {
    if ((await this.get(name)) === null) throw new IamStoreError("not_found", `Service identity ${name} does not exist.`);
    const frn = this.scope.principalFrn("service-identity", name);
    await this.scope.records.remove("service-identity", name);
    await removePrincipalState(this.scope, frn);
    this.scope.audit(context, "iam:DeleteServiceIdentity", [frn]);
  }
}
