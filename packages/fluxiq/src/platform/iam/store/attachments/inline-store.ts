import { assertPolicyName } from "../assert/index.ts";
import type { IamChangeContext, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import { parsePolicyDocument } from "../parse/index.ts";
import { principalTypeLabel, requirePrincipal } from "../principals/index.ts";
import type { IamStoredInlinePolicy } from "../records/index.ts";

/** Inline identity policies owned by one principal. */
export class IamInlineStore {
  private readonly scope: IamStoreScope;

  constructor(scope: IamStoreScope) {
    this.scope = scope;
  }

  async put(principalFrn: string, name: string, document: unknown, context: IamChangeContext): Promise<void> {
    const principal = await requirePrincipal(this.scope, principalFrn);
    assertPolicyName(name);
    const record: IamStoredInlinePolicy = { principalFrn, name, document: parsePolicyDocument(document, "identity") };
    await this.scope.records.put("inline", `${principalFrn}/${name}`, record);
    this.scope.audit(context, `iam:Put${principalTypeLabel(principal.type)}Policy`, [principalFrn]);
  }

  async delete(principalFrn: string, name: string, context: IamChangeContext): Promise<void> {
    const principal = await requirePrincipal(this.scope, principalFrn);
    if (!(await this.scope.records.remove("inline", `${principalFrn}/${name}`))) {
      throw new IamStoreError("inline_not_found", `${principalFrn} has no inline policy ${name}.`);
    }
    this.scope.audit(context, `iam:Delete${principalTypeLabel(principal.type)}Policy`, [principalFrn]);
  }

  async list(principalFrn: string): Promise<IamStoredInlinePolicy[]> {
    const all = await this.scope.records.list<IamStoredInlinePolicy>("inline");
    return all.filter((record) => record.principalFrn === principalFrn);
  }
}
