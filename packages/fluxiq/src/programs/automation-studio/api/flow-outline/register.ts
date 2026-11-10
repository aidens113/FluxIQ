// A Flow's list of steps: read it, change it in words or by hand, and undo a change.
//
// A change is made against the version the list showed. If the Flow changed since, a change to steps that
// were touched is answered with who changed them and which steps, and nothing is saved; a change to other
// steps is saved on top. Undo applies the undo edits a saved change returned; it is hidden from the assistant
// because it would let the assistant send any graph edit, which the list's own edits do not.
import { editFlowStepsInput, getFlowOutlineInput, undoFlowEditInput } from "@fluxiq/contracts/program-api-inputs";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import { applyOutlineOperations, type Operations } from "./apply-steps.ts";
import { editFlowSteps } from "./edit-steps.ts";
import { outlineOfStoredFlow } from "./outline-of.ts";

/** What the endpoints need: the registry and the service. */
export type FlowOutlineApiDependencies = { readonly registry: GlobalProgramApiRegistry; readonly service: AutomationStudioService };

export function registerFlowOutlineEndpoints(dependencies: FlowOutlineApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowOutline,
    assistant: {
      input: getFlowOutlineInput,
      summary: "Lists a Flow's steps as a numbered list in plain words, with the version number the list was read at.",
      phrases: ["what are the steps in this flow", "show me this flow step by step", "read me the steps"],
      contextArgs: { projectId: "projectId", flowId: "flowId" }
    },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowOutline",
    accessLevel: "Read",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const input = getFlowOutlineInput.read(request.payload);
      if (!input.ok) return { ok: false, error: input.error };
      const { projectId, flowId } = input.value;
      const read = await service.flowGraphPatch.readFlowGraph({ projectId, flowId });
      return { ok: true, payload: { outline: await outlineOfStoredFlow(service, projectId, flowId, read.graph!), revision: read.currentRevision, updatedAt: read.updatedAt } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.editFlowSteps,
    assistant: {
      input: editFlowStepsInput,
      summary: "Changes a Flow's list of steps by step number: rename a step, change a value, move a step up or down, delete a step, or add one.",
      phrases: ["rename step 2", "move step 4 up", "delete step 3", "change the wording of a step"],
      contextArgs: { projectId: "projectId", flowId: "flowId" }
    },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:EditFlowSteps",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const input = editFlowStepsInput.read(request.payload);
      if (!input.ok) return { ok: false, error: input.error };
      const { projectId, flowId, baseRevision, edit, via } = input.value;
      return { ok: true, payload: await editFlowSteps(service, { projectId, flowId, baseRevision, edit: edit as Parameters<typeof editFlowSteps>[1]["edit"], madeBy: via === "assistant" ? "assistant" : "person" }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.undoFlowEdit,
    assistant: { hidden: "Applies the undo edits a saved change returned, which only the list screen holds; a person asks the assistant to change the steps back in words." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:UndoFlowEdit",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const input = undoFlowEditInput.read(request.payload);
      if (!input.ok) return { ok: false, error: input.error };
      const { projectId, flowId, baseRevision, inverseOperations, message } = input.value;
      return { ok: true, payload: await applyOutlineOperations(service, { projectId, flowId, baseRevision, operations: inverseOperations as Operations, message: message ?? "Undo the last change to the steps", madeBy: "person" }) };
    }
  });
}
