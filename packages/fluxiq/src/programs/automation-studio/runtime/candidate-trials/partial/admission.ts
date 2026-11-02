import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { invokeExecutionCallbackRoot } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioSubflowTrialRequest } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { trialExecutionSource } from "../observation/index.ts";
import { bindPartialTrialContext } from "./bind.ts";
import { managePartialTrialFrame } from "./frame.ts";
import { partialTrialContext } from "./of.ts";
import { observePartialTrialCallback } from "./observe.ts";
import { PartialTrialReadOnlyCheckout } from "./read-only.ts";
import { partialTrialReadOnlyContexts } from "./read-only-contexts.ts";
import { partialTrialContexts } from "./contexts.ts";

/** One real partial invocation on the continuation's already configured trial series. */
export class PartialTrialAdmission {
  private busy = false;

  constructor(private readonly gate: object, private readonly port: object) {}

  async run<TReceiver, TArguments extends unknown[], TResult>(request: AutomationStudioSubflowTrialRequest, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, fromStep = false): Promise<Awaited<TResult>> {
    if (this.busy) throw new Error("subflow.trial_in_flight");
    this.busy = true;
    const prior = partialTrialContexts.get(request);
    try {
      request.signal.throwIfAborted();
      const source = trialExecutionSource(this.port) ?? trialExecutionSource(this.gate);
      const parent = partialTrialContext(request) ?? partialTrialContext(this.gate) ?? partialTrialContext(this.port);
      const bound = request.proposal.scope;
      if ((source || parent) && (bound.buildId !== request.scope.buildId || bound.briefId !== request.scope.briefId || bound.planDigest !== request.scope.planDigest || bound.subflowKey !== request.scope.subflowKey)) throw new Error("subflow.trial_identity_mismatch");
      const readOnly = PartialTrialReadOnlyCheckout.pin(this.port, request);
      if (readOnly) {
        if (fromStep) throw new Error("subflow.trial_readonly_from_step_unsupported");
        if ((source && source.callbacks !== readOnly.binding.callbacks) || (parent && parent.callbacks !== readOnly.binding.callbacks)) throw new Error("subflow.trial_readonly_source_mismatch");
        partialTrialReadOnlyContexts.set(request, readOnly);
        return await readOnly.invokeFrame(call, request.signal);
      }
      if (parent) {
        if (source && source.callbacks !== parent.callbacks) throw new Error("subflow.trial_observation_source_mismatch");
        if (source) source.manageFrame(call);
        else managePartialTrialFrame(parent.callbacks, call);
        bindPartialTrialContext(request, parent);
        return await observePartialTrialCallback(request, call, request.signal, request);
      }
      if (!source) return await call.callback.apply(call.receiver, call.args);
      source.manageFrame(call);
      const { origin, record } = source.original(JSON.stringify(["partial", request.scope, request.proposal.revision, request.proposal.digest, fromStep]));
      const completionDigest = record.invocationId;
      if (!completionDigest) throw new Error("subflow.trial_origin_invalid");
      return await invokeExecutionCallbackRoot({
        callbacks: source.callbacks,
        reserve: signal => source.reserve(origin, signal ?? request.signal),
        finish: root => source.finish(root, origin, completionDigest),
        unverified: root => source.unverified(root, origin, completionDigest),
        interrupted: (root, reason) => source.connected().producer.interrupted(root, reason),
        release: reservation => source.consumer.release(reservation),
        prepared: async (parent, originalRoot) => {
          await source.prepareToolParent(request, parent, originalRoot);
          bindPartialTrialContext(request, { parent, callbacks: source.callbacks, automation: source.automation, originalRoot, toolObserver: source.toolObserver, toolRequest: request, prepareToolParent: source.prepareToolParent.bind(source) });
        }
      }, call, request.signal);
    } finally {
      partialTrialReadOnlyContexts.delete(request);
      if (prior) partialTrialContexts.set(request, prior);
      else partialTrialContexts.delete(request);
      this.busy = false;
    }
  }
}
