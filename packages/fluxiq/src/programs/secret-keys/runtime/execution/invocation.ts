import { invokeOwnedExecutionCallbackSync, prepareObservedExecutionCallback, type ExecutionCallbackCall, type ExecutionCallbackObservation, type OwnedExecutionCallback } from "../../../../runtime/execution-observation/index.ts";
import { HeldKeys, type HeldRevealAuthorization } from "../held-keys.ts";
import { SecretProviderKeyRefusalError } from "../../../../runtime/models/secrets/execution/dispatch/index.ts";

/** Private state of one real native entry; copied arguments never issue a receipt. */
export class SecretKeysExecutionInvocation {
  #observation: ExecutionCallbackObservation | undefined;
  #check: (() => void) | undefined;
  #refusal: Error | undefined;
  #nativeCall: { owner: object; returned: Promise<unknown> } | undefined;
  #makeRefusal: ((message: string) => Error) | undefined;
  #grant: { heldKeys: HeldKeys; authorization: HeldRevealAuthorization; cancel: typeof clearTimeout } | undefined;

  get observation(): ExecutionCallbackObservation {
    if (!this.#observation) throw new Error("secret.execution.entry_missing");
    return this.#observation;
  }

  bind<TReceiver, TArguments extends unknown[], TResult>(original: OwnedExecutionCallback<TReceiver, TArguments, TResult>): void {
    if (this.#check) throw new Error("secret.execution.entry_rebound");
    this.#observation = original.observation;
    const completion = original.completion.bind(original);
    this.#check = () => {
      if (completion() === "unknown") throw new Error("secret.execution.coverage_unknown");
    };
    this.#makeRefusal = message => {
      const call = this.#nativeCall;
      if (!call) throw new Error("secret.execution.native_call_missing");
      return new SecretProviderKeyRefusalError(message, call.owner, call.returned, original);
    };
    Object.freeze(this);
  }

  assert(): void {
    if (!this.#check) throw new Error("secret.execution.entry_missing");
    this.#check();
  }

  refusal(message: string): Error {
    if (!this.#makeRefusal) throw new Error("secret.execution.entry_missing");
    const error = this.#makeRefusal(message);
    this.#refusal = error;
    return error;
  }

  nativeCall(owner: object, returned: Promise<unknown>): void {
    if (this.#nativeCall) throw new Error("secret.execution.native_call_rebound");
    this.#nativeCall = { owner, returned };
  }

  completedRefusal(error: unknown): boolean {
    return this.#refusal !== undefined && this.#refusal === error;
  }

  ownGrant(heldKeys: HeldKeys, authorization: HeldRevealAuthorization, cancel: typeof clearTimeout): void {
    if (this.#grant) throw new Error("secret.execution.grant_rebound");
    this.#grant = { heldKeys, authorization, cancel };
  }

  releaseGrant(): void {
    this.#grant = undefined;
  }

  cleanupGrant(): void {
    const grant = this.#grant;
    this.#grant = undefined;
    if (grant) HeldKeys.revokeOwnedAuthorization(grant.heldKeys, grant.authorization, grant.cancel);
  }

  sync<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
    this.assert();
    const result = invokeOwnedExecutionCallbackSync(this.observation, call);
    this.assert();
    return result;
  }

  async invoke<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
    this.assert();
    const owned = await prepareObservedExecutionCallback(this.observation, call);
    if (!owned.isManaged()) {
      owned.unknown();
      await owned.flush();
      throw new Error("secret.execution.callback_unmanaged");
    }
    let outcome: { ok: true; value: Awaited<TResult> } | { ok: false; error: unknown };
    try { outcome = { ok: true, value: await owned.invoke() }; }
    catch (error) { outcome = { ok: false, error }; }
    const settled = owned.completion() === "settled";
    if (!settled && owned.completion() !== "unknown") owned.unknown();
    try { await owned.flush(); }
    catch (cleanup) {
      if (!outcome.ok) throw new AggregateError([outcome.error, cleanup], "secret.execution.callback_cleanup_failed");
      throw cleanup;
    }
    if (!outcome.ok) throw outcome.error;
    if (!settled) throw new Error("secret.execution.callback_unverified");
    this.assert();
    return outcome.value;
  }
}
