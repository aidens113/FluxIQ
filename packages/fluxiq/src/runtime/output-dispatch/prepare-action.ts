import type { DomainOutputDefinition } from "../../domains/index.ts";
import type { RegisteredOutputAction } from "./action.ts";
import { compactJsonObject } from "./compact.ts";
import type { PreparedOutputAction } from "./prepared-action.ts";
import type { OutputTargetPreparer } from "./target-preparer.ts";
/** Preparation changes only parameters; verified identity and confirmation stay original. */
export function prepareOutputAction(action: RegisteredOutputAction, domainId: string | null, output: DomainOutputDefinition, preparer: OutputTargetPreparer | undefined): PreparedOutputAction {
  if (!preparer)
    return { ok: true, action };
  const view = Object.freeze({
    actionType: action.actionType,
    parameters: action.parameters,
    ...(action.outputId !== undefined ? { outputId: action.outputId } : {}),
    ...(action.confirmationInputId !== undefined ? { confirmationInputId: action.confirmationInputId } : {}),
    ...(action.confirmationTimeoutMs !== undefined ? { confirmationTimeoutMs: action.confirmationTimeoutMs } : {}),
    ...(action.metadata !== undefined ? { metadata: action.metadata } : {})
  });
  const prepared = preparer({ action: view, domainId, output });
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
