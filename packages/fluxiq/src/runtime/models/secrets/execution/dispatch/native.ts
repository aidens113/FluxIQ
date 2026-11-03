import { ExecutionCallbackPolicies, flushObservedExecutionCallbacks, invokeOwnedExecutionCallbackSync, type ExecutionCallbackCall, type ExecutionCallbackObservation } from "../../../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "../../../execution/index.ts";
import { invokeSessionProviderKeyCallback } from "./original.ts";
import type { AutomationStudioSessionKeyPorts } from "../../session-key.ts";
import type { SessionProviderKeyExecutionPorts } from "../ports.ts";

/** Pin the original native capability once; identities choose a route, never a completion. */
export class SessionProviderKeyExecution {
  readonly native: SessionProviderKeyExecutionPorts | undefined;
  readonly snapshot: SessionProviderKeyExecutionPorts["snapshot"] | undefined;
  readonly create: SessionProviderKeyExecutionPorts["createSessionRevealAuthorization"] | undefined;
  readonly reveal: SessionProviderKeyExecutionPorts["revealKeyWithAuthorization"] | undefined;
  readonly revoke: SessionProviderKeyExecutionPorts["revokeRevealAuthorization"] | undefined;
  readonly unlocked: SessionProviderKeyExecutionPorts["unlockedSessionFor"] | undefined;
  readonly #matches: SessionProviderKeyExecutionPorts["matches"] | undefined;
  readonly #refusal: SessionProviderKeyExecutionPorts["isCompletedRefusal"] | undefined;

  constructor(readonly original: AutomationStudioSessionKeyPorts, native: SessionProviderKeyExecutionPorts | undefined, private readonly execution: ModelExecutionOptions | undefined) {
    if (!execution?.observation || !native) return;
    if (this.member(native, "original") !== original) throw new Error("secret.execution.foreign_native_owner");
    const matches = this.member(native, "matches");
    if (typeof matches !== "function" || !ExecutionCallbackPolicies.isPure(native, matches)) throw new Error("secret.execution.native_port_unverified");
    this.native = native;
    this.#matches = matches as SessionProviderKeyExecutionPorts["matches"];
    this.#refusal = this.member(native, "isCompletedRefusal") as SessionProviderKeyExecutionPorts["isCompletedRefusal"];
    // Validate original native receiver/prototype before inspecting its public method descriptors.
    invokeOwnedExecutionCallbackSync(this.observation, { receiver: native, callback: this.#matches, args: [original, Object.freeze({})] });
    this.snapshot = this.member(native, "snapshot") as SessionProviderKeyExecutionPorts["snapshot"];
    this.create = this.member(native, "createSessionRevealAuthorization") as SessionProviderKeyExecutionPorts["createSessionRevealAuthorization"];
    this.reveal = this.member(native, "revealKeyWithAuthorization") as SessionProviderKeyExecutionPorts["revealKeyWithAuthorization"];
    this.revoke = this.member(native, "revokeRevealAuthorization") as SessionProviderKeyExecutionPorts["revokeRevealAuthorization"];
    this.unlocked = this.member(native, "unlockedSessionFor") as SessionProviderKeyExecutionPorts["unlockedSessionFor"];
  }

  pin<TKey extends keyof AutomationStudioSessionKeyPorts>(key: TKey): AutomationStudioSessionKeyPorts[TKey] {
    if (!this.native) return this.original[key];
    return this.member(this.original, key) as AutomationStudioSessionKeyPorts[TKey];
  }

  get observation(): ExecutionCallbackObservation {
    const observation = this.execution?.observation;
    if (!observation) throw new Error("secret.execution.observation_missing");
    return observation;
  }

  matches(originalCallback: object, nativeCallback: object | undefined): boolean {
    const native = this.native;
    if (!native || !this.#matches || !nativeCallback || !ExecutionCallbackPolicies.isOwningFrame(native, nativeCallback)) return false;
    return invokeOwnedExecutionCallbackSync(this.observation, { receiver: native, callback: this.#matches, args: [this.original, originalCallback] });
  }

  async invoke<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
    if (!ExecutionCallbackPolicies.isOwningFrame(call.receiver, call.callback)) return await this.originalCall(call);
    let original: Promise<Awaited<TResult>>;
    try { original = Promise.resolve(call.callback.apply(call.receiver, call.args)); }
    catch (error) { original = Promise.reject(error); }
    return await this.awaited(original);
  }

  originalCall<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
    return invokeSessionProviderKeyCallback(this.execution, call);
  }

  start<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, Promise<TResult>>): Promise<TResult> {
    if (!ExecutionCallbackPolicies.isOwningFrame(call.receiver, call.callback)) throw new Error("secret.execution.native_port_unverified");
    return call.callback.apply(call.receiver, call.args);
  }

  async awaited<TResult>(original: Promise<TResult>): Promise<TResult> {
    let outcome: { ok: true; value: TResult } | { ok: false; error: unknown };
    try { outcome = { ok: true, value: await original }; }
    catch (error) { outcome = { ok: false, error }; }
    try { await flushObservedExecutionCallbacks(this.execution?.observation); }
    catch (cleanup) {
      if (!outcome.ok) throw new AggregateError([outcome.error, cleanup], "secret.execution.native_cleanup_failed");
      throw cleanup;
    }
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }

  completedRefusal(error: unknown, original: Promise<unknown>): boolean {
    const native = this.native;
    if (!native || !this.#refusal || !ExecutionCallbackPolicies.isPure(native, this.#refusal)) return false;
    return invokeOwnedExecutionCallbackSync(this.observation, { receiver: native, callback: this.#refusal, args: [error, original] });
  }

  private member(target: object, key: PropertyKey): unknown {
    const prototype = Object.getPrototypeOf(target);
    const descriptor = Object.getOwnPropertyDescriptor(target, key) ?? (prototype ? Object.getOwnPropertyDescriptor(prototype, key) : undefined);
    if (!descriptor) return undefined;
    if (!("value" in descriptor)) throw new Error("secret.execution.native_accessor_unverified");
    return descriptor.value;
  }
}
