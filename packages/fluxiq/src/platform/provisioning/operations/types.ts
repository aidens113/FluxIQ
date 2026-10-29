import type { PlatformProvisioningInput, PlatformProvisioningOperationName, PlatformProvisioningResult } from "@fluxiq/contracts/platform";
import type { ProvisioningContext, ProvisioningGrant } from "../context/index.ts";
import type { PlatformProvisioningCaller } from "../types.ts";

/** What an allowed call carries into its operation: who called, the grant its IAM changes cite, and the account the decision named. */
export type ProvisioningInvocation = {
  caller: PlatformProvisioningCaller;
  grant: ProvisioningGrant;
  accountId: string;
};

/**
 * One provisioning operation.
 *
 * - `target`: the account segment its IAM decision is made on, before it
 *   runs: the input's `userId`, the id a lookup by email or externalId found
 *   (else `UNRESOLVED_ACCOUNT_ID`), or for `createAccount` the id it will mint;
 * - `execute`: does the work and returns the result, or throws a
 *   `ProvisioningRefusal`. Any other throw is an error, not a refusal.
 */
export type ProvisioningOperation<TName extends PlatformProvisioningOperationName> = {
  target(context: ProvisioningContext, input: PlatformProvisioningInput<TName>): Promise<string>;
  execute(context: ProvisioningContext, input: PlatformProvisioningInput<TName>, invocation: ProvisioningInvocation): Promise<PlatformProvisioningResult<TName>>;
};

/** Every operation of the contract's table, by name. */
export type ProvisioningOperationTable = { [TName in PlatformProvisioningOperationName]: ProvisioningOperation<TName> };
