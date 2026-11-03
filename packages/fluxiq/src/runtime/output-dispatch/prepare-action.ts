import type { DomainOutputDefinition } from "../../domains/index.ts";
import type { RegisteredOutputAction } from "./action.ts";
import { compactJsonObject } from "./compact.ts";
import { outputDispatchFailure } from "./failure.ts";
import type { PreparedOutputAction } from "./prepared-action.ts";
import type { OutputTargetPreparer } from "./target-preparer.ts";

/** Preparation changes only parameters; the output's identity and its confirmation stay the caller's. */
export function prepareOutputAction(action: RegisteredOutputAction, domainId: string | null, output: DomainOutputDefinition, preparer: OutputTargetPreparer | undefined): PreparedOutputAction {
  if (!preparer) {
    if (output.metadata?.outputTargetPreparationRequired === true) return {
      ok: false,
      error: `Output ${output.id} requires a registered domain target preparer.`,
      failure: outputDispatchFailure("graph_validation_or_unknown_node", "output.target_preparer_missing", false, "target_resolution")
    };
    return { ok: true, action };
  }
  const prepared = preparer({ action, domainId, output });
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    action: {
      ...action,
      parameters: prepared.parameters !== undefined ? prepared.parameters : action.parameters,
      ...(prepared.diagnostics ? { metadata: compactJsonObject({ ...(action.metadata ?? {}), elementTargetResolution: prepared.diagnostics }) } : {})
    },
    ...(prepared.diagnostics ? { diagnostics: prepared.diagnostics } : {}),
    ...(prepared.resolution ? { resolution: prepared.resolution } : {})
  };
}
