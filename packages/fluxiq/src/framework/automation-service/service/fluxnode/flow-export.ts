// A FluxNode's learned Flow as a reviewable document (fluxnode-plan N8; `fluxNodeFlowExportSchema`):
// the Flow as Core stores it, the steps a replay runs (`flow.saved`) with their digest, which is the
// version's identity, and the learned draft it was last left (its candidate id, revision and digest).
//
// **Pinned** (`./pin/`), the export is the pinned version, whatever was learned since, with the proposals
// its runs held (`proposals`, and each one's steps under `flow.proposals`) for the developer to review.
// Pinning adopts the proposal named, else the newest waiting; with none, the version as it stands. The pin
// is kept with the Flow, so a restart keeps it. Versions are numbered by the order they were first pinned;
// a version never pinned is shown as the next number.
//
// **No secret input's value** (`format: "secret"`, `./secrets/`): the attempt saves a step bound to one
// with no default, so nothing here holds one; the export drops any default such a binding still carries,
// in the Flow, its saved steps and every proposal, as a second check.

import { FLUXNODE_FLOW_EXPORT_FORMAT, fluxNodeSecretInputs, type FluxNodeExportFlowRequest, type FluxNodeFlowExport } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import type { FluxNodeServiceOutcome } from "./fluxnode-service.ts";
import { isRegisteredPipeline, type FluxNodeRegistered } from "./pipeline/index.ts";
import { FluxNodePins, type FluxNodePinView } from "./pin/index.ts";
import type { FluxNodeRunRegistry } from "./run-registry.ts";
import { fluxNodeWithoutSecretDefaults } from "./secrets/index.ts";

const UNKNOWN_PROPOSAL = "No proposal with that id waits on this FluxNode's pin.";

export async function fluxNodeFlowExport(service: AutomationStudioService, runs: FluxNodeRunRegistry, pins: Pick<FluxNodePins, "view" | "pin">, registered: FluxNodeRegistered, request: Pick<FluxNodeExportFlowRequest, "pin" | "proposal">, at: number): Promise<FluxNodeServiceOutcome<FluxNodeFlowExport>> {
  if (!request.pin && request.proposal !== undefined) return refused("A proposal is adopted by pinning it: give pin: true with it.", "export_flow.proposal_without_pin");
  const view = request.pin ? await pins.pin(registered, request.proposal, at) : await pins.view(registered);
  if ("unknownProposal" in view) return refused(UNKNOWN_PROPOSAL, "export_flow.unknown_proposal");
  const secrets = isRegisteredPipeline(registered) ? [] : fluxNodeSecretInputs(registered.spec.inputs).names;
  const artifact = fluxNodeWithoutSecretDefaults(json(await service.getFlow(registered.projectId, registered.flowId)), secrets) as JsonObject;
  const saved = view.record ? view.record.saved : view.learned;
  const stepsDigest = saved?.stepsDigest ?? (await FluxNodePins.nothingLearned());
  const known = view.versions.indexOf(stepsDigest);
  const learned = runs.learnedOf(registered.flowId);
  const learnedDraft: JsonObject | undefined = learned ? { candidateId: learned.candidateId, ...(learned.revision === undefined ? {} : { revision: learned.revision }), ...(learned.digest === undefined ? {} : { digest: learned.digest }) } : undefined;
  const proposals = view.record?.proposals ?? [];
  return {
    ok: true,
    value: {
      format: FLUXNODE_FLOW_EXPORT_FORMAT, formatVersion: 1, name: registered.name, specHash: registered.specHash, flowId: registered.flowId, flowPath: registered.flowPath,
      flowVersion: known >= 0 ? known + 1 : view.versions.length + 1, pinned: view.record?.stepsDigest === stepsDigest, exportedAt: at, stepsDigest,
      ...(proposals.length ? { proposals: proposals.map(({ saved: _steps, ...identity }) => identity) } : {}),
      flow: { artifact, ...(learnedDraft ? { learnedDraft } : {}), ...(saved ? { saved: fluxNodeWithoutSecretDefaults(json(saved), secrets) } : {}), ...proposalsOf(view, secrets) }
    }
  };
}

/** Each waiting proposal's saved Flow, by its id, for the review. */
function proposalsOf(view: FluxNodePinView, secrets: readonly string[]): { proposals?: JsonValue } {
  const proposals = view.record?.proposals ?? [];
  return proposals.length ? { proposals: Object.fromEntries(proposals.map((proposal) => [proposal.proposalId, fluxNodeWithoutSecretDefaults(json(proposal.saved), secrets)])) as JsonValue } : {};
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function refused(message: string, code: string): FluxNodeServiceOutcome<FluxNodeFlowExport> {
  return { ok: false, refusal: { code: "invalid_request", message, issues: [{ path: "/proposal", code, message }] } };
}
