// A Flow's saved versions: the list, a restore point, and putting an earlier version back.

import { createGraphSnapshotInput, listGraphRevisionsInput, restoreGraphSnapshotInput } from "@fluxiq/contracts/program-api-inputs";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerGraphRevisionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listGraphRevisions,
    assistant: {
      input: listGraphRevisionsInput,
      summary: "Lists the saved versions of a Flow, newest first, with who made each change and why.",
      phrases: ["show the version history", "what changed in this flow", "who edited this flow"],
      contextArgs: { projectId: "projectId", flowId: "flowId" }
    },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListGraphRevisions",
    accessLevel: "List",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const input = listGraphRevisionsInput.read(request.payload);
      if (!input.ok) return { ok: false, error: input.error };
      const { limit, cursor, ...flow } = input.value;
      return {
        ok: true,
        payload: await service.flowGraphPatch.listFlowGraphRevisions({
          ...flow,
          ...(limit === undefined ? {} : { limit }),
          ...(cursor === undefined ? {} : { cursor })
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createGraphSnapshot,
    assistant: {
      input: createGraphSnapshotInput,
      summary: "Keeps the Flow as it is now as a restore point, so this version can be put back later.",
      phrases: ["save a restore point", "keep this version of the flow"],
      contextArgs: { projectId: "projectId", flowId: "flowId" }
    },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:CreateGraphSnapshot",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const input = createGraphSnapshotInput.read(request.payload);
      if (!input.ok) return { ok: false, error: input.error };
      return { ok: true, payload: await service.flowGraphPatch.createFlowGraphSnapshot({ projectId: input.value.projectId, flowId: input.value.flowId, ...(input.value.revisionNumber === undefined ? {} : { revisionNumber: input.value.revisionNumber }) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.restoreGraphSnapshot,
    assistant: {
      input: restoreGraphSnapshotInput,
      summary: "Puts an earlier version of a Flow back as a new version; nothing in the history is erased.",
      phrases: ["restore an earlier version", "go back to the previous version of this flow"],
      contextArgs: { projectId: "projectId", flowId: "flowId" }
    },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:RestoreGraphSnapshot",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const input = restoreGraphSnapshotInput.read(request.payload);
      if (!input.ok) return { ok: false, error: input.error };
      return { ok: true, payload: await service.flowGraphPatch.restoreFlowGraphSnapshot({ projectId: input.value.projectId, flowId: input.value.flowId, snapshotSha256: input.value.snapshotSha256, mutationId: input.value.mutationId, ...(input.value.message ? { message: input.value.message } : {}) }) };
    }
  });
}
