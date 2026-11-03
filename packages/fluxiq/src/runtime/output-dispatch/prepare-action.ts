import type { DomainOutputDefinition } from "../../domains/index.ts";
import type { RegisteredOutputAction } from "./action.ts";
import { compactJsonObject } from "./compact.ts";
import type { PreparedOutputAction } from "./prepared-action.ts";
import type { OutputTargetPreparationPort } from "./contracts/index.ts";
import { outputDispatchFailure } from "./results/index.ts";
import { invokeObservedOutputSync, type OutputExecutionObservation } from "./admission/internal/index.ts";
/** Preparation changes only parameters; verified identity and confirmation stay original. */
export function prepareOutputAction(action: RegisteredOutputAction, domainId: string | null, output: DomainOutputDefinition, preparer: OutputTargetPreparationPort | undefined, observation?: OutputExecutionObservation): PreparedOutputAction {
  if (!preparer) {
    if (output.metadata?.outputTargetPreparationRequired === true) return {
      ok: false,
      error: `Output ${output.id} requires a registered domain target preparer.`,
      failure: outputDispatchFailure("graph_validation_or_unknown_node", "output.target_preparer_missing", false, "target_resolution")
    };
    return { ok: true, action };
  }
  const view = Object.freeze({
    actionType: action.actionType,
    parameters: action.parameters,
    ...(action.outputId !== undefined ? { outputId: action.outputId } : {}),
    ...(action.confirmationInputId !== undefined ? { confirmationInputId: action.confirmationInputId } : {}),
    ...(action.confirmationTimeoutMs !== undefined ? { confirmationTimeoutMs: action.confirmationTimeoutMs } : {}),
    ...(action.metadata !== undefined ? { metadata: action.metadata } : {})
  });
  const callback = typeof preparer === "function" ? preparer : preparer.callback;
  const receiver = typeof preparer === "function" ? undefined : preparer.receiver;
  const prepared = invokeObservedOutputSync(observation, { receiver, callback, args: [{ action: view, domainId, output }] });
  if (!prepared.ok)
    return prepared;
  return {
    ok: true,
    action: {
      ...view,
      parameters: prepared.parameters !== undefined ? prepared.parameters : view.parameters,
      ...(prepared.diagnostics ? { metadata: compactJsonObject({ ...(view.metadata ?? {}), elementTargetResolution: prepared.diagnostics }) } : {})
    },
    ...(prepared.diagnostics ? { diagnostics: prepared.diagnostics } : {}),
    ...(prepared.resolution ? { resolution: prepared.resolution } : {})
  };
}
