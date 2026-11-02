import type { ExecutionEntry, ExecutionObservationContext } from "../../../../../runtime/execution-admission/index.ts";
import { ExecutionBackendAttempts, ExecutionRetrySeriesOwner, type ExecutionCallbackCall, type PreparedExecutionCallback } from "../../../../../runtime/execution-observation/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../../../runtime/output-dispatch/admission/index.ts";
import type { PartialTrialContext } from "../../candidate-trials/partial/index.ts";
import { AutomationStudioSiteResetCallbackPolicies, AutomationStudioSiteResetObservation } from "../../flow-bootstrap/reset-observation/index.ts";
import type { AutomationStudioBuildToolObserverOptions } from "./options.ts";
import type { AutomationStudioBuildToolRequestState } from "./state.ts";
import { AutomationStudioBuildToolFactories } from "./factory.ts";
import { AutomationStudioBuildToolRequests } from "./request.ts";
import { AutomationStudioBuildToolCallbackScope } from "./callback-scope.ts";
import { withAutomationStudioBuildToolCallbackScope } from "./with-callback-scope.ts";
import { AutomationStudioBuildToolAuxiliaryCalls } from "./auxiliary-calls.ts";
import { AutomationStudioProjectBuildToolObservers } from "./project.ts";

/** One configured cohort observes the original tools and their real backend callbacks. */
export class AutomationStudioBuildToolObserver {
  private readonly series: ExecutionRetrySeriesOwner;
  private readonly backends: ExecutionBackendAttempts;
  private readonly issueRun: (originalRoot: ExecutionEntry) => Promise<object>;
  private readonly reader: OrdinaryExecutionRunBindingReader;
  private readonly roots: AutomationStudioBuildToolObserverOptions["roots"];
  private readonly callbacks: AutomationStudioBuildToolObserverOptions["callbacks"];
  private readonly lastCallbacks = new WeakMap<object, PreparedExecutionCallback>();
  private readonly descendantOwners = new WeakMap<object, object>();

  constructor(options: AutomationStudioBuildToolObserverOptions) {
    this.roots = options.roots;
    this.callbacks = options.callbacks;
    this.series = new ExecutionRetrySeriesOwner(options.scope);
    this.backends = new ExecutionBackendAttempts(options.scope, options.callbacks);
    this.issueRun = options.runBindings.issueOrdinaryRunBinding.bind(options.runBindings);
    this.reader = Object.freeze({ readOrdinaryRunBinding: options.runBindings.readOrdinaryRunBinding.bind(options.runBindings) });
  }

  async prepareParent(request: object, parent: ExecutionObservationContext, originalRoot: ExecutionEntry): Promise<void> {
    const original = this.claim(request, "scope");
    const proof = await this.issueRun(originalRoot);
    if (!this.reader.readOrdinaryRunBinding(proof, parent)) throw new Error("execution_observation.tool_run_binding_unverified");
    AutomationStudioBuildToolRequests.advance(request, original, { observer: this, role: "scope", series: original.series, kind: "parent", parent, run: { proof, reader: this.reader } });
  }

  bindParent(request: object, parent: ExecutionObservationContext, inheritedRequest?: object): void {
    const inherited = inheritedRequest ? AutomationStudioBuildToolRequests.of(inheritedRequest) : undefined;
    if (inherited && (inherited.observer !== this || inherited.kind === "preparing")) throw new Error("execution_observation.foreign_tool_request");
    if (inherited?.run && !inherited.run.reader.readOrdinaryRunBinding(inherited.run.proof, parent)) throw new Error("execution_observation.tool_run_binding_unverified");
    const series = inherited?.role === "invocation" ? inherited.series : this.series.forInvocation(Object.freeze({}));
    const state: AutomationStudioBuildToolRequestState = { observer: this, role: "invocation", series, kind: "parent", parent, ...(inherited?.run ? { run: inherited.run } : {}) };
    AutomationStudioBuildToolRequests.bind(request, state);
  }

  /** Trusted Core composition reads only this observer's original active companion. */
  callbackContext(originalRequest: object): PartialTrialContext | undefined {
    const original = AutomationStudioBuildToolRequests.of(originalRequest);
    if (!original) return undefined;
    if (original.observer !== this || original.kind === "preparing") throw new Error("execution_observation.foreign_tool_request");
    if (original.run && !original.run.reader.readOrdinaryRunBinding(original.run.proof, original.parent)) throw new Error("execution_observation.tool_run_binding_unverified");
    return { parent: original.parent, callbacks: this.callbacks, automation: undefined, toolObserver: this, toolRequest: originalRequest };
  }

  async withCallbackScope<T>(originalRequest: object, actualCoreBody: () => Promise<T>, originalCoreReceiver?: unknown): Promise<T> {
    const original = AutomationStudioBuildToolRequests.of(originalRequest);
    if (original && original.observer !== this) throw new Error("execution_observation.foreign_tool_request");
    const scope = AutomationStudioBuildToolCallbackScope.open(originalRequest, originalCoreReceiver);
    let primary: { error: unknown } | undefined;
    try {
      return await actualCoreBody();
    } catch (error) {
      primary = { error };
      throw error;
    } finally {
      try {
        scope?.close();
      } catch (cleanupError) {
        if (primary) throw new AggregateError([primary.error, cleanupError], "Tool callback and scope restoration failed.");
        throw cleanupError;
      }
    }
  }

  /** An internal look continues the completed actual delegate under its still-open Core frame. */
  bindDescendant(originalRequest: object, freshRequest: object): void {
    const original = AutomationStudioBuildToolRequests.of(originalRequest);
    const invocation = this.lastCallbacks.get(originalRequest);
    const frame = AutomationStudioSiteResetObservation.of(originalRequest);
    if (!original || original.observer !== this || original.kind === "preparing" || !invocation || this.callbacks.completion(invocation) !== "settled") {
      throw new Error("execution_observation.unverified_backend_retry");
    }
    if (!frame || frame.context.callbacks !== this.callbacks || frame.context.toolObserver !== this || frame.context.parent.reservation !== original.parent.reservation) {
      throw new Error("execution_observation.foreign_tool_callback_scope");
    }
    this.bindParent(freshRequest, frame.context.parent, originalRequest);
    this.descendantOwners.set(freshRequest, this.descendantOwners.get(originalRequest) ?? originalRequest);
  }

  /** A genuine internal producer has its own series under the current open Core frame. */
  bindAuxiliary(originalRequest: object, originalInvocation: object): void {
    AutomationStudioBuildToolAuxiliaryCalls.require(originalInvocation, this, originalRequest);
    const original = AutomationStudioBuildToolRequests.of(originalRequest);
    const frame = AutomationStudioSiteResetObservation.of(originalRequest);
    if (!original || original.observer !== this || original.kind === "preparing" || !frame || frame.context.callbacks !== this.callbacks || frame.context.toolObserver !== this || frame.context.parent.reservation !== original.parent.reservation) {
      throw new Error("execution_observation.foreign_tool_callback_scope");
    }
    if (original.run && !original.run.reader.readOrdinaryRunBinding(original.run.proof, frame.context.parent)) throw new Error("execution_observation.tool_run_binding_unverified");
    const existing = AutomationStudioBuildToolRequests.of(originalInvocation);
    if (existing && (existing.observer !== this || existing.kind === "preparing")) throw new Error("execution_observation.foreign_auxiliary_invocation");
    const state: AutomationStudioBuildToolRequestState = { observer: this, role: "invocation", series: existing?.series ?? this.series.forInvocation(originalInvocation), kind: "parent", parent: frame.context.parent, ...(original.run ? { run: original.run } : {}) };
    if (existing) AutomationStudioBuildToolRequests.advance(originalInvocation, existing, state);
    else AutomationStudioBuildToolRequests.bind(originalInvocation, state);
  }

  async invoke<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, request: object, signal?: AbortSignal, originalCoreCarrier?: object): Promise<Awaited<TResult>> {
    if (originalCoreCarrier && (originalCoreCarrier !== request || AutomationStudioProjectBuildToolObservers.of(originalCoreCarrier) !== this)) throw new Error("execution_observation.foreign_core_carrier");
    const pinned = this.pin(call);
    const existing = AutomationStudioBuildToolRequests.of(request);
    if (existing) return await this.invokeCallback(request, pinned, signal, originalCoreCarrier);
    const original = this.claim(request);
    const factory = this.manage(pinned);
    let scope: AutomationStudioBuildToolCallbackScope | undefined;
    let primary: { error: unknown } | undefined;
    try {
      return await this.roots.invoke(pinned, signal, { prepared: async (parent, root) => {
        const proof = await this.issueRun(root);
        if (!this.reader.readOrdinaryRunBinding(proof, parent)) throw new Error("execution_observation.tool_run_binding_unverified");
        AutomationStudioBuildToolRequests.advance(request, original, { observer: this, role: "invocation", series: original.series, kind: "active", parent, run: { proof, reader: this.reader } });
        if (factory || originalCoreCarrier) scope = AutomationStudioBuildToolCallbackScope.open(request, factory ? pinned.receiver : originalCoreCarrier);
      } });
    } catch (error) {
      primary = { error };
      throw error;
    } finally {
      try {
        scope?.close();
      } catch (cleanupError) {
        if (primary) throw new AggregateError([primary.error, cleanupError], "Tool root and scope restoration failed.");
        throw cleanupError;
      }
    }
  }

  async invokeCallback<TReceiver, TArguments extends unknown[], TResult>(request: object, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal, originalCoreCarrier?: object): Promise<Awaited<TResult>> {
    if (originalCoreCarrier && (originalCoreCarrier !== request || AutomationStudioProjectBuildToolObservers.of(originalCoreCarrier) !== this)) throw new Error("execution_observation.foreign_core_carrier");
    const pinned = this.pin(call);
    const original = AutomationStudioBuildToolRequests.of(request);
    if (!original || original.observer !== this || original.kind === "preparing") throw new Error("execution_observation.foreign_tool_request");
    const series = original.role === "scope" ? this.series.forInvocation(Object.freeze({})) : original.series;
    const pending: AutomationStudioBuildToolRequestState = { observer: this, role: "invocation", series, kind: "preparing", ...(original.run ? { run: original.run } : {}) };
    AutomationStudioBuildToolRequests.advance(request, original, pending);
    const factory = this.manage(pinned);
    if (!factory) this.backends.begin(series);
    const invocation = await this.callbacks.prepare(this.callbacks.forParent(original.parent), pinned, signal);
    if (!factory) this.backends.entered(series, invocation);
    const parent = this.callbacks.context(invocation);
    const active: AutomationStudioBuildToolRequestState = { observer: this, role: "invocation", series, kind: "active", parent, ...(original.run ? { run: original.run } : {}) };
    AutomationStudioBuildToolRequests.advance(request, pending, active);
    let result: Awaited<TResult>;
    let primary: { error: unknown } | undefined;
    try {
      result = factory || originalCoreCarrier
        ? await withAutomationStudioBuildToolCallbackScope(request, () => this.callbacks.invoke(invocation, pinned), factory ? pinned.receiver : originalCoreCarrier)
        : await this.callbacks.invoke(invocation, pinned);
    } catch (error) {
      primary = { error };
      throw error;
    } finally {
      this.lastCallbacks.set(request, invocation);
      const owner = this.descendantOwners.get(request);
      if (owner) this.lastCallbacks.set(owner, invocation);
      try {
        const current = AutomationStudioBuildToolRequests.of(request);
        if (current !== active || current.observer !== this || current.role !== "invocation" || current.series !== series || current.run !== original.run || current.parent.reservation !== original.parent.reservation) {
          throw new Error("execution_observation.tool_request_changed");
        }
        // The child's real completion remains above; only its caller's still
        // original parent is restored for the next sibling operation.
        const resumed: AutomationStudioBuildToolRequestState = original.role === "scope" ? { ...original, role: "invocation", series } : original;
        AutomationStudioBuildToolRequests.advance(request, current, resumed);
      } catch (cleanupError) {
        if (primary) throw new AggregateError([primary.error, cleanupError], "Tool callback and parent restoration failed.");
        throw cleanupError;
      }
    }
    if (!factory && this.callbacks.completion(invocation) !== "settled") {
      this.callbacks.unknown(invocation);
    }
    await this.callbacks.flush();
    return result;
  }

  private claim(request: object, role: "scope" | "invocation" = "invocation"): AutomationStudioBuildToolRequestState {
    const original: AutomationStudioBuildToolRequestState = { observer: this, role, series: this.series.forInvocation(Object.freeze({})), kind: "preparing" };
    AutomationStudioBuildToolRequests.bind(request, original);
    return original;
  }

  private manage<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>) {
    const contract = AutomationStudioBuildToolFactories.of(call.callback);
    const core = AutomationStudioSiteResetCallbackPolicies.isPure(call.receiver, call.callback) || AutomationStudioSiteResetCallbackPolicies.isOwningFrame(call.receiver, call.callback);
    AutomationStudioSiteResetCallbackPolicies.manage(this.callbacks, call);
    if (!contract || this.callbacks.isManaged(call)) return contract ?? (core ? "core" : undefined);
    const binding = call.binding;
    const identity = { receiver: call.receiver, callback: call.callback, ...(binding ? { binding } : {}) };
    if (contract === "pure") this.callbacks.manage({ ...identity, contract: "no_direct_effects" });
    else this.callbacks.manage({ ...identity, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => this.callbacks.frameCompletion(invocation, contract === "recall" ? undefined : this.callbacks.owner) });
    return contract;
  }

  private pin<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): ExecutionCallbackCall<TReceiver, TArguments, TResult> {
    const binding = call.binding;
    return { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(binding ? { binding } : {}) };
  }
}
