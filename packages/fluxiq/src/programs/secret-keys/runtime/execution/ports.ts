import { ExecutionCallbackPolicies, prepareObservedExecutionCallback, type ExecutionCallbackCall, type ExecutionCallbackObservation } from "../../../../runtime/execution-observation/index.ts";
import type { SessionProviderKeyExecutionPorts } from "../../../../runtime/models/secrets/execution/index.ts";
import type { SecretKeysService } from "../service.ts";
import type { SecretKeysExecutionEntries } from "./owner/index.ts";
import { SecretKeysExecutionInvocation } from "./invocation.ts";
import { SecretProviderKeyRefusalError } from "../../../../runtime/models/secrets/execution/dispatch/index.ts";

const ownsRefusal = SecretProviderKeyRefusalError.owns;
const completedRefusal = SecretProviderKeyRefusalError.prototype.completedFor;

/** A pinned native adapter always enters its real private body before any work. */
export class SecretKeysExecutionPorts implements SessionProviderKeyExecutionPorts {
  readonly #entries: SecretKeysExecutionEntries;
  readonly #pairs: readonly object[];
  readonly #prototype: object | null;

  constructor(readonly original: SecretKeysService, entries: SecretKeysExecutionEntries, nativePairs: readonly object[]) {
    this.#entries = Object.freeze({ ...entries });
    this.#pairs = Object.freeze([...nativePairs]);
    this.#prototype = Object.getPrototypeOf(original);
    ExecutionCallbackPolicies.remember(this, this.matches, "pure");
    ExecutionCallbackPolicies.remember(this, this.isCompletedRefusal, "pure");
    for (const callback of [this.snapshot, this.createSessionRevealAuthorization, this.revealKeyWithAuthorization, this.revokeRevealAuthorization, this.unlockedSessionFor]) ExecutionCallbackPolicies.remember(this, callback, "frame");
    Object.freeze(this);
  }

  matches(originalReceiver: unknown, originalCallback: object): boolean {
    if (originalReceiver === this.original && Object.getPrototypeOf(this.original) !== this.#prototype) throw new Error("secret.execution.service_changed");
    return originalReceiver === this.original && this.#pairs.includes(originalCallback);
  }

  isCompletedRefusal(error: unknown, originalReturned: Promise<unknown>): boolean {
    return ownsRefusal(error) && completedRefusal.call(error, this.#entries.owner, originalReturned);
  }

  snapshot(observation: ExecutionCallbackObservation): ReturnType<SecretKeysService["snapshot"]> {
    const invocation = new SecretKeysExecutionInvocation();
    return this.start(observation, { receiver: this.#entries.owner, callback: this.#entries.snapshot, args: [invocation] }, invocation);
  }

  createSessionRevealAuthorization(input: Parameters<SecretKeysService["createSessionRevealAuthorization"]>[0], observation: ExecutionCallbackObservation): ReturnType<SecretKeysService["createSessionRevealAuthorization"]> {
    const invocation = new SecretKeysExecutionInvocation();
    return this.start(observation, { receiver: this.#entries.owner, callback: this.#entries.createSessionRevealAuthorization, args: [input, invocation] }, invocation);
  }

  revealKeyWithAuthorization(input: Parameters<SecretKeysService["revealKeyWithAuthorization"]>[0], observation: ExecutionCallbackObservation): ReturnType<SecretKeysService["revealKeyWithAuthorization"]> {
    const invocation = new SecretKeysExecutionInvocation();
    return this.start(observation, { receiver: this.#entries.owner, callback: this.#entries.revealKeyWithAuthorization, args: [input, invocation] }, invocation);
  }

  revokeRevealAuthorization(id: string, observation: ExecutionCallbackObservation): Promise<void> {
    const invocation = new SecretKeysExecutionInvocation();
    return this.start(observation, { receiver: this.#entries.owner, callback: this.#entries.revokeRevealAuthorization, args: [id, invocation] }, invocation);
  }

  unlockedSessionFor(userId: string, observation: ExecutionCallbackObservation): Promise<string | null> {
    const invocation = new SecretKeysExecutionInvocation();
    return this.start(observation, { receiver: this.#entries.owner, callback: this.#entries.unlockedSessionFor, args: [userId, invocation] }, invocation);
  }

  private start<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, invocation: SecretKeysExecutionInvocation): Promise<Awaited<TResult>> {
    const returned = this.invoke(observation, call, invocation);
    invocation.nativeCall(this.#entries.owner, returned);
    return returned;
  }

  private async invoke<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, invocation: SecretKeysExecutionInvocation): Promise<Awaited<TResult>> {
    const owned = await prepareObservedExecutionCallback(observation, call);
    invocation.bind(owned);
    let outcome: { ok: true; value: Awaited<TResult> } | { ok: false; error: unknown };
    try { outcome = { ok: true, value: await owned.invoke() }; }
    catch (error) { outcome = { ok: false, error }; }
    const settled = owned.completion() === "settled";
    const cleanupErrors: unknown[] = [];
    if (!outcome.ok || !settled) {
      try { invocation.cleanupGrant(); }
      catch (cleanup) { cleanupErrors.push(cleanup); }
    } else invocation.releaseGrant();
    try {
      if (!settled && owned.completion() !== "unknown") owned.unknown();
    } catch (cleanup) { cleanupErrors.push(cleanup); }
    try { await owned.flush(); }
    catch (cleanup) { cleanupErrors.push(cleanup); }
    if (cleanupErrors.length && !outcome.ok) throw new AggregateError([outcome.error, ...cleanupErrors], "secret.execution.owner_cleanup_failed");
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "secret.execution.owner_cleanup_failed");
    if (!outcome.ok) throw outcome.error;
    if (!settled) throw new Error("secret.execution.operation_unverified");
    return outcome.value;
  }
}
