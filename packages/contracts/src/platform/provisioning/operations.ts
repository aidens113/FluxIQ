import type { z } from "zod";
import { accountStatusChangeInputSchema, disableAccountResultSchema, enableAccountResultSchema } from "./account-status-change.ts";
import { addMemberInputSchema, addMemberResultSchema } from "./add-member.ts";
import { createAccountHttpInputSchema, createAccountInputSchema, createAccountResultSchema } from "./create-account.ts";
import { deleteAccountInputSchema, deleteAccountResultSchema } from "./delete-account.ts";
import { getAccountInputSchema, getAccountResultSchema } from "./get-account.ts";
import { rotateCredentialsInputSchema, rotateCredentialsResultSchema } from "./rotate-credentials.ts";
import { sendWelcomeInputSchema, sendWelcomeResultSchema } from "./send-welcome.ts";
import { setPasswordInputSchema, setPasswordResultSchema } from "./set-password.ts";
import { setPoliciesInputSchema, setPoliciesResultSchema } from "./set-policies.ts";

/**
 * The provisioning operations (`platform.provisioning`), each with:
 *
 * - `action`: the IAM action the call is authorised and audited as. Every one
 *   names `Account`, so the predefined `FluxIQProvisioner` policy's
 *   `platform:*Account*` allows exactly these;
 * - `http`: whether the private listener serves it (`POST /provisioning/<name>`);
 *   `setPassword` is in-process only;
 * - `input`: the in-process input schema; `httpInput`: the listener's, which
 *   refuses a password; `result`: the result schema.
 */
export const PLATFORM_PROVISIONING_OPERATIONS = Object.freeze({
  createAccount: { action: "platform:CreateAccount", http: true, input: createAccountInputSchema, httpInput: createAccountHttpInputSchema, result: createAccountResultSchema },
  sendWelcome: { action: "platform:SendAccountWelcome", http: true, input: sendWelcomeInputSchema, httpInput: sendWelcomeInputSchema, result: sendWelcomeResultSchema },
  setPassword: { action: "platform:SetAccountPassword", http: false, input: setPasswordInputSchema, httpInput: null, result: setPasswordResultSchema },
  setPolicies: { action: "platform:SetAccountPolicies", http: true, input: setPoliciesInputSchema, httpInput: setPoliciesInputSchema, result: setPoliciesResultSchema },
  addMember: { action: "platform:AddAccountMembership", http: true, input: addMemberInputSchema, httpInput: addMemberInputSchema, result: addMemberResultSchema },
  disableAccount: { action: "platform:DisableAccount", http: true, input: accountStatusChangeInputSchema, httpInput: accountStatusChangeInputSchema, result: disableAccountResultSchema },
  enableAccount: { action: "platform:EnableAccount", http: true, input: accountStatusChangeInputSchema, httpInput: accountStatusChangeInputSchema, result: enableAccountResultSchema },
  deleteAccount: { action: "platform:DeleteAccount", http: true, input: deleteAccountInputSchema, httpInput: deleteAccountInputSchema, result: deleteAccountResultSchema },
  rotateCredentials: { action: "platform:RotateAccountCredentials", http: true, input: rotateCredentialsInputSchema, httpInput: rotateCredentialsInputSchema, result: rotateCredentialsResultSchema },
  getAccount: { action: "platform:GetAccount", http: true, input: getAccountInputSchema, httpInput: getAccountInputSchema, result: getAccountResultSchema }
} as const);

export type PlatformProvisioningOperationName = keyof typeof PLATFORM_PROVISIONING_OPERATIONS;

/** An operation's in-process input, as parsed. */
export type PlatformProvisioningInput<TName extends PlatformProvisioningOperationName> = z.infer<(typeof PLATFORM_PROVISIONING_OPERATIONS)[TName]["input"]>;

/** An operation's result. */
export type PlatformProvisioningResult<TName extends PlatformProvisioningOperationName> = z.infer<(typeof PLATFORM_PROVISIONING_OPERATIONS)[TName]["result"]>;

/** The private listener's path prefix: `POST /provisioning/<operation name>`. */
export const PLATFORM_PROVISIONING_HTTP_PATH_PREFIX = "/provisioning/";

/** The operation a listener path names, or null for an unknown or in-process-only one (`operation_unavailable`). */
export function provisioningOperationForHttpPath(path: string): PlatformProvisioningOperationName | null {
  if (!path.startsWith(PLATFORM_PROVISIONING_HTTP_PATH_PREFIX)) return null;
  const name = path.slice(PLATFORM_PROVISIONING_HTTP_PATH_PREFIX.length);
  if (!Object.hasOwn(PLATFORM_PROVISIONING_OPERATIONS, name)) return null;
  const operation = name as PlatformProvisioningOperationName;
  return PLATFORM_PROVISIONING_OPERATIONS[operation].http ? operation : null;
}
