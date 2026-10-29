import { addMemberOperation } from "./add-member.ts";
import { createAccountOperation } from "./create-account.ts";
import { deleteAccountOperation } from "./delete-account.ts";
import { disableAccountOperation } from "./disable-account.ts";
import { enableAccountOperation } from "./enable-account.ts";
import { getAccountOperation } from "./get-account.ts";
import { rotateCredentialsOperation } from "./rotate-credentials.ts";
import { sendWelcomeOperation } from "./send-welcome.ts";
import { setPasswordOperation } from "./set-password.ts";
import { setPoliciesOperation } from "./set-policies.ts";
import type { ProvisioningOperationTable } from "./types.ts";

/** Every operation of `PLATFORM_PROVISIONING_OPERATIONS`, by name; the type makes a missing one a compile error. */
export const PROVISIONING_OPERATION_TABLE: Readonly<ProvisioningOperationTable> = Object.freeze({
  createAccount: createAccountOperation,
  sendWelcome: sendWelcomeOperation,
  setPassword: setPasswordOperation,
  setPolicies: setPoliciesOperation,
  addMember: addMemberOperation,
  disableAccount: disableAccountOperation,
  enableAccount: enableAccountOperation,
  deleteAccount: deleteAccountOperation,
  rotateCredentials: rotateCredentialsOperation,
  getAccount: getAccountOperation
});
