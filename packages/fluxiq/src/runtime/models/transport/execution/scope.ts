import { ExecutionCallbackPolicies, invokeOwnedExecutionCallbackSync, prepareObservedExecutionCallback, type ExecutionCallbackCall, type ExecutionCallbackSettlement, type ManagedExecutionCallbackRegistration, type OwnedExecutionCallback } from "../../../execution-observation/index.ts";
import { invokeModelExecutionDelegate, type ModelExecutionOptions } from "../../execution/index.ts";

type FetchCall = OwnedExecutionCallback<unknown, [RequestInfo | URL, RequestInit?], Promise<Response>>;
type Completion = Parameters<Extract<ManagedExecutionCallbackRegistration<unknown, [RequestInfo | URL, RequestInit?], Promise<Response>>, { contract: "managed_direct_effects" }>["consumeCompletion"]>[0];
const nativeFetch = globalThis.fetch;
const active = new Set<ModelTransportExecution>();

/** A transport owns its actual native request and body drain, never an injected fetch's work. */
export class ModelTransportExecution {
  #fetch: FetchCall | undefined;
  #original: Promise<Response> | undefined;
  #drained = false;
  #fetchStarted = false;

  constructor(private readonly execution: ModelExecutionOptions | undefined) {}

  sync<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
    return invokeOwnedExecutionCallbackSync(this.execution?.observation, call);
  }

  async invoke<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal, carrier?: object): Promise<Awaited<TResult>> {
    return await invokeModelExecutionDelegate(this.execution, call, carrier, signal);
  }

  async fetch(receiver: unknown, callback: typeof fetch, args: [RequestInfo | URL, RequestInit?], signal: AbortSignal): Promise<Response> {
    if (!this.execution?.observation) return await callback.apply(receiver, args);
    if (this.#fetchStarted) throw new Error("model.transport.fetch_already_invoked");
    this.#fetchStarted = true;
    this.#fetch = await prepareObservedExecutionCallback(this.execution.observation, { receiver, callback, args }, signal);
    if (callback === nativeFetch) active.add(this);
    const response = await this.#fetch.invoke();
    if (callback !== nativeFetch && this.#fetch.completion() !== "settled") {
      this.#fetch.unknown();
      await this.#fetch.flush();
      throw new Error("model.transport.fetch_outcome_unknown");
    }
    return response;
  }

  /** Called only after the owning bounded body reader or complete stream has actually finished. */
  async drained(): Promise<void> {
    this.#drained = true;
    if (this.#fetch?.isManaged() && (this.#fetch.completion() === "pending" || this.#fetch.completion() === "unverified")) await this.#fetch.recheck();
  }

  dispose(): void {
    active.delete(this);
  }

  matches(invocation: object): boolean {
    return this.#fetch?.matchesInvocation(invocation) === true;
  }

  consume(input: Completion): ExecutionCallbackSettlement | null {
    if (!this.matches(input.invocation)) return { disposition: "unknown", code: "model.native_fetch.foreign_invocation" };
    if (input.outcome.kind === "rejected") return { disposition: "pending", reason: "callback_threw" };
    if (!input.returned || this.#original && this.#original !== input.returned) return { disposition: "unknown", code: "model.native_fetch.promise_mismatch" };
    this.#original = input.returned;
    return this.#drained ? { disposition: "settled", completionDigest: "model.native_fetch.body_drained", assessmentDigest: "model.native_fetch.original_request_completed" } : null;
  }
}

ExecutionCallbackPolicies.rememberManagedLexical({ receiver: undefined, callback: nativeFetch, contract: "managed_direct_effects", consumeCompletion: input => {
  const owner = [...active].find(value => value.matches(input.invocation));
  return owner ? owner.consume(input) : { disposition: "unknown", code: "model.native_fetch.owner_missing" };
} });
