import type { ExecutionCallbackCall, ExecutionCallbackCompletionState, ExecutionCallbackObservation, PreparedExecutionCallback } from "../contracts/index.ts";
import { ExecutionObservationBindings } from "../bindings.ts";
import { ExecutionCallbackPolicies } from "../policies/index.ts";
import { ExecutionObservationSource } from "../source.ts";

const prepare = ExecutionObservationSource.prototype.prepare;
const invoke = ExecutionObservationSource.prototype.invoke;
const context = ExecutionObservationSource.prototype.context;
const forParent = ExecutionObservationSource.prototype.forParent;
const completion = ExecutionObservationSource.prototype.completion;
const managed = ExecutionObservationSource.prototype.isManaged;
const readOnly = ExecutionObservationSource.prototype.isReadOnly;
const recheck = ExecutionObservationSource.prototype.recheck;
const unknown = ExecutionObservationSource.prototype.unknown;
const interrupt = ExecutionObservationSource.prototype.interrupt;
const flush = ExecutionObservationSource.prototype.flush;

/** One original typed call, with its durable child available before the call begins. */
export class OwnedExecutionCallback<TReceiver, TArguments extends unknown[], TResult> {
  readonly observation: ExecutionCallbackObservation | undefined;
  readonly #source: ExecutionObservationSource | undefined;
  readonly #prepared: PreparedExecutionCallback | undefined;
  readonly #call: ExecutionCallbackCall<TReceiver, TArguments, TResult>;
  readonly #signal: AbortSignal | undefined;
  readonly #parent: ExecutionCallbackObservation | undefined;
  #carrier: object | undefined;
  #invoked = false;
  #started = false;

  private constructor(source: ExecutionObservationSource | undefined, prepared: PreparedExecutionCallback | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal, parent?: ExecutionCallbackObservation) {
    this.#source = source;
    this.#prepared = prepared;
    this.#call = call;
    this.#signal = signal;
    this.#parent = parent;
    this.observation = source && prepared ? forParent.call(source, context.call(source, prepared)) : undefined;
    Object.freeze(this);
  }

  static async prepare<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal): Promise<OwnedExecutionCallback<TReceiver, TArguments, TResult>> {
    const binding = call.binding;
    const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(binding ? { binding } : {}) };
    if (!observation) return new OwnedExecutionCallback(undefined, undefined, pinned, signal);
    const source = ExecutionObservationBindings.read(observation).source;
    ExecutionCallbackPolicies.manage(source, pinned);
    const prepared = await (prepare<TReceiver, TArguments, TResult>).call(source, observation, pinned, signal);
    return new OwnedExecutionCallback(source, prepared, pinned, signal, observation);
  }

  bindCarrier(carrier: object): void {
    if (this.#invoked || this.#carrier || !this.#call.args.some(value => value === carrier)) throw new Error("execution_observation.carrier_not_original_argument");
    if (!this.#source || !this.#prepared || !this.observation || !this.#parent) return;
    ExecutionObservationBindings.bindCarrier(carrier, this, this.#source, this.#prepared, this.observation, this.#parent, this.#call.receiver, this.#call.callback);
    this.#carrier = carrier;
  }

  isManaged(): boolean {
    return this.#source ? managed.call(this.#source, this.#call) : false;
  }

  isFrom(source: ExecutionObservationSource): boolean {
    return this.#source === source;
  }

  matchesInvocation(invocation: object): boolean {
    return this.#started && this.#source !== undefined && this.#prepared === invocation;
  }

  isReadOnly(): boolean {
    return this.#source ? readOnly.call(this.#source, this.#call) : false;
  }

  completion(): ExecutionCallbackCompletionState {
    return this.#source && this.#prepared ? completion.call(this.#source, this.#prepared) : "unverified";
  }

  async invoke(): Promise<Awaited<TResult>> {
    if (this.#invoked) throw new Error("execution_observation.owned_callback_already_invoked");
    this.#invoked = true;
    let failed = false;
    let failure: unknown;
    try {
      if (this.#signal?.aborted) await this.abort();
      if (!this.#source || !this.#prepared) return await this.#call.callback.apply(this.#call.receiver, this.#call.args);
      if (this.#carrier) ExecutionObservationBindings.activateCarrier(this.#carrier, this);
      this.#started = true;
      return await (invoke<TReceiver, TArguments, TResult>).call(this.#source, this.#prepared, this.#call);
    } catch (error) {
      failed = true;
      failure = error;
      throw error;
    } finally {
      if (this.#carrier) {
        try { ExecutionObservationBindings.retireCarrier(this.#carrier, this); }
        catch (cleanup) {
          if (failed) throw new AggregateError([failure, cleanup], "execution_observation.carrier_cleanup_failed");
          throw cleanup;
        }
      }
    }
  }

  async recheck(): Promise<ExecutionCallbackCompletionState> {
    return this.#source && this.#prepared ? await recheck.call(this.#source, this.#prepared) : "unverified";
  }

  unknown(): void {
    if (this.#source && this.#prepared) unknown.call(this.#source, this.#prepared);
  }

  async flush(): Promise<void> {
    if (this.#source) await flush.call(this.#source);
  }

  private async abort(): Promise<never> {
    const reason: unknown = this.#signal?.reason ?? new DOMException("Aborted", "AbortError");
    try {
      if (this.#source && this.#prepared) {
        await interrupt.call(this.#source, this.#prepared, "aborted");
        await flush.call(this.#source);
      }
    } catch (error) {
      throw new AggregateError([reason, error], "execution_observation.aborted_cleanup_failed");
    }
    throw reason;
  }
}
