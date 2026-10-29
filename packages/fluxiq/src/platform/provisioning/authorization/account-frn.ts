import { formatFluxIQResourceName } from "@fluxiq/contracts/iam";

/**
 * The FRN a provisioning decision is made on, `frn:fluxiq:platform::account/<id>`.
 * Every decision names one concrete account: the evaluator refuses a pattern
 * (`account/*`) as a resource, so a create names the id it is about to mint,
 * and a lookup that finds nothing names `UNRESOLVED_ACCOUNT_ID`.
 */
export function provisioningAccountFrn(accountId: string): string {
  return formatFluxIQResourceName({ service: "platform", workspaceId: null, resourceType: "account", resourceId: accountId });
}
