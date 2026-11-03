import type { SecretKeysSnapshot } from "../../../types.ts";
import type { SecretKeysService } from "../../service.ts";
import type { SessionProviderKeyExecutionPorts } from "../../../../../runtime/models/secrets/execution/index.ts";
import type { SecretKeysOperationContext } from "./context.ts";
import type { SecretKeysExecutionInvocation } from "../invocation.ts";
import { SecretKeysExecutionPorts } from "../ports.ts";
import { SecretKeysExecutionReceipts } from "../receipts.ts";
import { SecretKeysOperationPins } from "../pins.ts";
import { snapshotSecretKeys, createSessionSecretAuthorization, revealSessionSecret, revokeSessionSecretAuthorization, unlockedSecretSession, readSecretKeysClock } from "../operations/index.ts";

/** One original Service owns its native operation bodies and the receipt issuer. */
export class SecretKeysExecutionOwner {
  readonly #receipts = new SecretKeysExecutionReceipts();
  readonly #ports: SessionProviderKeyExecutionPorts;

  constructor(readonly context: SecretKeysOperationContext, nativePairs: readonly object[]) {
    SecretKeysOperationPins.declare(context);
    this.#receipts.register({ receiver: this, callback: this.#snapshot });
    this.#receipts.register({ receiver: this, callback: this.#create });
    this.#receipts.register({ receiver: this, callback: this.#reveal });
    this.#receipts.register({ receiver: this, callback: this.#revoke });
    this.#receipts.register({ receiver: this, callback: this.#unlocked });
    this.#ports = new SecretKeysExecutionPorts(context.original, { owner: this, snapshot: this.#snapshot, createSessionRevealAuthorization: this.#create, revealKeyWithAuthorization: this.#reveal, revokeRevealAuthorization: this.#revoke, unlockedSessionFor: this.#unlocked }, nativePairs);
  }

  ports(): SessionProviderKeyExecutionPorts {
    return this.#ports;
  }

  #snapshot(invocation: SecretKeysExecutionInvocation): Promise<SecretKeysSnapshot> {
    invocation.assert();
    return this.#receipts.returning(snapshotSecretKeys(this.context, invocation), invocation);
  }

  #create(input: Parameters<SecretKeysService["createSessionRevealAuthorization"]>[0], invocation: SecretKeysExecutionInvocation): ReturnType<SecretKeysService["createSessionRevealAuthorization"]> {
    invocation.assert();
    return this.#receipts.returning(createSessionSecretAuthorization(this.context, input, invocation), invocation);
  }

  #reveal(input: Parameters<SecretKeysService["revealKeyWithAuthorization"]>[0], invocation: SecretKeysExecutionInvocation): ReturnType<SecretKeysService["revealKeyWithAuthorization"]> {
    invocation.assert();
    return this.#receipts.returning(revealSessionSecret(this.context, input, invocation), invocation);
  }

  #revoke(id: string, invocation: SecretKeysExecutionInvocation): Promise<void> {
    revokeSessionSecretAuthorization(this.context, id, invocation);
    return this.#receipts.returning(Promise.resolve(), invocation);
  }

  #unlocked(userId: string, invocation: SecretKeysExecutionInvocation): Promise<string | null> {
    const now = readSecretKeysClock(this.context, invocation);
    const value = unlockedSecretSession(this.context, userId, now, invocation);
    return this.#receipts.returning(Promise.resolve(value), invocation);
  }
}
