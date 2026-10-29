import type { IamStoreScope } from "../context/index.ts";
import type { IamStoredAttachments, IamStoredBoundary, IamStoredGuardrails } from "../records/index.ts";

/** Where `name` is still in use: principal FRNs holding it as an attachment or boundary, and `guardrails`. */
export async function policyUsers(scope: IamStoreScope, name: string): Promise<string[]> {
  const users: string[] = [];
  for (const attachments of await scope.records.list<IamStoredAttachments>("attachments")) {
    if (attachments.policies.includes(name)) users.push(attachments.principalFrn);
  }
  for (const boundary of await scope.records.list<IamStoredBoundary>("boundary")) {
    if (boundary.policy === name) users.push(`${boundary.principalFrn} (boundary)`);
  }
  const guardrails = await scope.records.get<IamStoredGuardrails>("guardrails", "");
  if (guardrails?.policies.includes(name)) users.push("the workspace guardrails");
  return users;
}
