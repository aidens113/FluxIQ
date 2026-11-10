// A FluxNode's learned Flow as a reviewable document (fluxnode-plan N8; `fluxNodeFlowExportSchema`):
// the Flow as Core stores it, which holds the learned steps once a whole run proved them and they were
// applied, and the learned draft it was last left (its candidate id, revision and digest). Pinning
// records the version exported as the one the program pinned.
//
// **Pinned replay is not enforced.** Nothing in the attempt replays a given version of a Flow or holds
// repairs back as proposals yet, so a pin is recorded and reported and changes no run.

import { FLUXNODE_FLOW_EXPORT_FORMAT, type FluxNodeFlowExport } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import type { FluxNodeRegistered } from "./pipeline/index.ts";
import type { FluxNodeRunRegistry } from "./run-registry.ts";

export async function fluxNodeFlowExport(service: AutomationStudioService, runs: FluxNodeRunRegistry, registered: FluxNodeRegistered, pin: boolean, at: number): Promise<FluxNodeFlowExport> {
  const artifact = JSON.parse(JSON.stringify(await service.getFlow(registered.projectId, registered.flowId))) as JsonObject;
  const learned = runs.learnedOf(registered.flowId);
  const flowVersion = Math.max(1, learned?.versions ?? 1);
  if (pin) runs.pin(registered.flowId, flowVersion, at);
  const learnedDraft: JsonObject | undefined = learned ? { candidateId: learned.candidateId, ...(learned.revision === undefined ? {} : { revision: learned.revision }), ...(learned.digest === undefined ? {} : { digest: learned.digest }) } : undefined;
  return {
    format: FLUXNODE_FLOW_EXPORT_FORMAT, formatVersion: 1, name: registered.name, specHash: registered.specHash, flowId: registered.flowId, flowPath: registered.flowPath,
    flowVersion, pinned: runs.pinnedOf(registered.flowId)?.flowVersion === flowVersion, exportedAt: at,
    flow: { artifact, ...(learnedDraft ? { learnedDraft } : {}) }
  };
}
