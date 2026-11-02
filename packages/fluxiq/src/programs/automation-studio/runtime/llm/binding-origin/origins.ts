import type { ExecutionCallbackIdentity } from "../../../../../runtime/execution-observation/index.ts";

/** Noninvoking identities recorded only while Core constructs the checked snapshot. */
export class AutomationStudioLlmBindingOrigins {
  private static readonly values = new WeakMap<object, Map<PropertyKey, { forwarded: object; receiver: object; callback: object }>>();

  static remember(snapshot: object, field: PropertyKey, forwarded: object, receiver: object, callback: object): void {
    let fields = this.values.get(snapshot);
    if (!fields) {
      fields = new Map();
      this.values.set(snapshot, fields);
    }
    if (fields.has(field)) throw new Error("execution_observation.binding_origin_already_bound");
    const original = this.values.get(receiver)?.get(field);
    fields.set(field, original?.forwarded === callback ? { ...original, forwarded } : { forwarded, receiver, callback });
  }

  static of<TReceiver extends object, TArguments extends unknown[], TResult>(receiver: TReceiver, field: PropertyKey, callback: (this: TReceiver, ...args: TArguments) => TResult): ExecutionCallbackIdentity<TReceiver, TArguments, TResult> {
    const original = this.values.get(receiver)?.get(field);
    if (!original || original.forwarded !== callback) return { receiver, callback };
    // Snapshot construction keeps the same slot signature and original receiver.
    // The private original snapshot/function identity check precedes this erased type relation.
    return { receiver: original.receiver as TReceiver, callback: original.callback as (this: TReceiver, ...args: TArguments) => TResult };
  }
}
