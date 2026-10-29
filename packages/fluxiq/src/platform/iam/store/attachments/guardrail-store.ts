import type { IamChangeContext, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import { IAM_MAX_ATTACHED_POLICIES } from "../limits/index.ts";
import type { IamPolicyStore } from "../policies/index.ts";
import type { IamStoredGuardrails } from "../records/index.ts";

const GUARDRAILS_KEY = "";

/** Workspace guardrails: managed policies of kind `guardrail` that bound every principal. */
export class IamGuardrailStore {
  private readonly scope: IamStoreScope;
  private readonly policies: IamPolicyStore;

  constructor(scope: IamStoreScope, policies: IamPolicyStore) {
    this.scope = scope;
    this.policies = policies;
  }

  async attach(policyName: string, context: IamChangeContext): Promise<void> {
    await this.policies.requireKind(policyName, "guardrail");
    const current = await this.list();
    if (current.includes(policyName)) throw new IamStoreError("already_attached", `${policyName} is already a workspace guardrail.`);
    if (current.length >= IAM_MAX_ATTACHED_POLICIES) {
      throw new IamStoreError("attachment_limit", `The workspace already has ${IAM_MAX_ATTACHED_POLICIES} guardrails.`);
    }
    const record: IamStoredGuardrails = { policies: [...current, policyName] };
    await this.scope.records.put("guardrails", GUARDRAILS_KEY, record);
    this.scope.audit(context, "iam:AttachWorkspaceGuardrail", [this.scope.policyFrn(policyName)]);
  }

  async detach(policyName: string, context: IamChangeContext): Promise<void> {
    const current = await this.list();
    if (!current.includes(policyName)) throw new IamStoreError("not_attached", `${policyName} is not a workspace guardrail.`);
    const record: IamStoredGuardrails = { policies: current.filter((name) => name !== policyName) };
    await this.scope.records.put("guardrails", GUARDRAILS_KEY, record);
    this.scope.audit(context, "iam:DetachWorkspaceGuardrail", [this.scope.policyFrn(policyName)]);
  }

  async list(): Promise<string[]> {
    const record = await this.scope.records.get<IamStoredGuardrails>("guardrails", GUARDRAILS_KEY);
    return record === null ? [] : [...record.policies];
  }
}
