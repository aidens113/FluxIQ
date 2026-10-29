import type { IamChangeContext, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import { IAM_MAX_ATTACHED_POLICIES } from "../limits/index.ts";
import type { IamPolicyStore } from "../policies/index.ts";
import { principalTypeLabel, requirePrincipal } from "../principals/index.ts";
import type { IamStoredAttachments } from "../records/index.ts";

/** Managed policies attached to principals. */
export class IamAttachmentStore {
  private readonly scope: IamStoreScope;
  private readonly policies: IamPolicyStore;

  constructor(scope: IamStoreScope, policies: IamPolicyStore) {
    this.scope = scope;
    this.policies = policies;
  }

  async attach(principalFrn: string, policyName: string, context: IamChangeContext): Promise<void> {
    const principal = await requirePrincipal(this.scope, principalFrn);
    await this.policies.requireKind(policyName, "identity");
    const attachments = await this.of(principalFrn);
    if (attachments.policies.includes(policyName)) {
      throw new IamStoreError("already_attached", `${policyName} is already attached to ${principalFrn}.`);
    }
    if (attachments.policies.length >= IAM_MAX_ATTACHED_POLICIES) {
      throw new IamStoreError("attachment_limit", `${principalFrn} already has ${IAM_MAX_ATTACHED_POLICIES} policies attached.`);
    }
    await this.scope.records.put("attachments", principalFrn, { principalFrn, policies: [...attachments.policies, policyName] });
    this.scope.audit(context, `iam:Attach${principalTypeLabel(principal.type)}Policy`, [principalFrn, this.scope.policyFrn(policyName)]);
  }

  async detach(principalFrn: string, policyName: string, context: IamChangeContext): Promise<void> {
    const principal = await requirePrincipal(this.scope, principalFrn);
    const attachments = await this.of(principalFrn);
    if (!attachments.policies.includes(policyName)) {
      throw new IamStoreError("not_attached", `${policyName} is not attached to ${principalFrn}.`);
    }
    const policies = attachments.policies.filter((name) => name !== policyName);
    await this.scope.records.put("attachments", principalFrn, { principalFrn, policies });
    this.scope.audit(context, `iam:Detach${principalTypeLabel(principal.type)}Policy`, [principalFrn, this.scope.policyFrn(policyName)]);
  }

  async list(principalFrn: string): Promise<string[]> {
    return [...(await this.of(principalFrn)).policies];
  }

  private async of(principalFrn: string): Promise<IamStoredAttachments> {
    return (await this.scope.records.get<IamStoredAttachments>("attachments", principalFrn)) ?? { principalFrn, policies: [] };
  }
}
