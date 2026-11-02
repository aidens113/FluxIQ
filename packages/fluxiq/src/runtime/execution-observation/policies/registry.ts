import {
  captureExecutionCallbackCompletions,
  type ExecutionCallbackCompletionPolicy,
  type ExecutionCallbackRegistrar,
} from "../configuration/index.ts";
import type { ExecutionCallbackIdentity, ManagedExecutionCallbackRegistration } from "../contracts/index.ts";
import type { ExecutionObservationSource } from "../source.ts";

/** Only original Core factories register their actual callback identities here. */
export class ExecutionCallbackPolicies {
  private static readonly receivers = new WeakMap<object, Map<object, "pure" | "frame">>();
  private static readonly lexical = new WeakMap<object, "pure" | "frame">();
  private static readonly completions = new WeakMap<object, Map<object, { readonly binding?: object; readonly policy: ExecutionCallbackCompletionPolicy }>>();
  private static readonly lexicalCompletions = new WeakMap<object, { readonly binding?: object; readonly policy: ExecutionCallbackCompletionPolicy }>();

  /** Original producer declarations are captured once; fulfillment alone is never a receipt. */
  static rememberManaged<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void {
    const policy = captureExecutionCallbackCompletions({ configure: registrar => registrar.manage(registration) });
    policy.apply({ manage(pinned): void {
      const receiver = pinned.receiver;
      const binding = pinned.binding;
      const entry = Object.freeze({ ...(binding !== undefined ? { binding } : {}), policy });
      if (receiver === undefined) {
        if (ExecutionCallbackPolicies.lexicalCompletions.has(pinned.callback)) throw new Error("site_reset.managed_callback_already_bound");
        ExecutionCallbackPolicies.lexicalCompletions.set(pinned.callback, entry);
        return;
      }
      if (receiver === null || (typeof receiver !== "object" && typeof receiver !== "function")) throw new Error("site_reset.managed_receiver_missing");
      const methods = ExecutionCallbackPolicies.completions.get(receiver) ?? new Map<object, { readonly binding?: object; readonly policy: ExecutionCallbackCompletionPolicy }>();
      if (methods.has(pinned.callback)) throw new Error("site_reset.managed_callback_already_bound");
      methods.set(pinned.callback, entry);
      ExecutionCallbackPolicies.completions.set(receiver, methods);
    } });
  }

  static remember(receiver: object, callback: object, contract: "pure" | "frame"): void {
    const methods = this.receivers.get(receiver) ?? new Map<object, "pure" | "frame">();
    const prior = methods.get(callback);
    if (prior && prior !== contract) throw new Error("site_reset.callback_contract_changed");
    methods.set(callback, contract);
    this.receivers.set(receiver, methods);
  }

  static rememberLexical(callback: object, contract: "pure" | "frame"): void {
    const prior = this.lexical.get(callback);
    if (prior && prior !== contract) throw new Error("site_reset.callback_contract_changed");
    this.lexical.set(callback, contract);
  }

  /** Membership only; no result value or method name can supply this contract. */
  static isPure(receiver: unknown, callback: object): boolean {
    return (receiver !== null && (typeof receiver === "object" || typeof receiver === "function") && this.receivers.get(receiver)?.get(callback) === "pure") || this.lexical.get(callback) === "pure";
  }

  /** Original owning frame declaration only; a supplied managed receipt is not a Core frame. */
  static isOwningFrame(receiver: unknown, callback: object): boolean {
    return (receiver !== null && (typeof receiver === "object" || typeof receiver === "function") && this.receivers.get(receiver)?.get(callback) === "frame") || this.lexical.get(callback) === "frame";
  }

  static manage<TReceiver, TArguments extends unknown[], TResult>(source: ExecutionObservationSource, identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void {
    if (source.isManaged(identity)) return;
    const receiver = identity.receiver;
    const managed = receiver === undefined ? this.lexicalCompletions.get(identity.callback) : receiver !== null && (typeof receiver === "object" || typeof receiver === "function") ? this.completions.get(receiver)?.get(identity.callback) : undefined;
    if (managed) {
      if (managed.binding !== identity.binding) throw new Error("site_reset.managed_binding_mismatch");
      const registrar: ExecutionCallbackRegistrar = { manage: registration => source.manage(registration) };
      managed.policy.apply(Object.freeze(registrar));
      return;
    }
    const contract = (receiver !== null && (typeof receiver === "object" || typeof receiver === "function") ? this.receivers.get(receiver)?.get(identity.callback) : undefined) ?? this.lexical.get(identity.callback);
    if (contract === "pure") source.manage({ ...identity, contract: "no_direct_effects" });
    else if (contract === "frame") source.manage({ ...identity, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => source.frameCompletion(invocation) });
  }
}
