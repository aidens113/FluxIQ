import type { SecretKeysExecutionInvocation } from "../invocation.ts";
import type { SecretKeysExecutionOwner } from "./owner.ts";
import type { SecretKeysService } from "../../service.ts";

/** Exact private native entry functions passed only to the original factory. */
export interface SecretKeysExecutionEntries {
  readonly owner: SecretKeysExecutionOwner;
  snapshot(this: SecretKeysExecutionOwner, invocation: SecretKeysExecutionInvocation): ReturnType<SecretKeysService["snapshot"]>;
  createSessionRevealAuthorization(this: SecretKeysExecutionOwner, input: Parameters<SecretKeysService["createSessionRevealAuthorization"]>[0], invocation: SecretKeysExecutionInvocation): ReturnType<SecretKeysService["createSessionRevealAuthorization"]>;
  revealKeyWithAuthorization(this: SecretKeysExecutionOwner, input: Parameters<SecretKeysService["revealKeyWithAuthorization"]>[0], invocation: SecretKeysExecutionInvocation): ReturnType<SecretKeysService["revealKeyWithAuthorization"]>;
  revokeRevealAuthorization(this: SecretKeysExecutionOwner, id: string, invocation: SecretKeysExecutionInvocation): Promise<void>;
  unlockedSessionFor(this: SecretKeysExecutionOwner, userId: string, invocation: SecretKeysExecutionInvocation): Promise<string | null>;
}
