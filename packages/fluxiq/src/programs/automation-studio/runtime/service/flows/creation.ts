import { randomUUID } from "node:crypto";
import type { AutomationStudioProject } from "../../../api/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { CanonicalAutomationStudioRepositories } from "../../../storage/index.ts";
import type { CanonicalAuthorityWholeOperation } from "../../../storage/canonical-authority/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioFlowStore } from "./store.ts";
import { AutomationStudioFlowWriter, flowScopeForProject } from "./writer.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";

/** Actual createFlow owner generates identity; replacement puts cannot allocate it. */
export class AutomationStudioFlowCreation {
  constructor(private readonly projects: AutomationStudioProjectStore, private readonly flows: AutomationStudioFlowStore, private readonly repositories: CanonicalAutomationStudioRepositories, private readonly writer: AutomationStudioFlowWriter, private readonly authority?: CanonicalAuthorityWholeOperation, private readonly facade?: Pick<AutomationStudioFacadePorts, "saveFlow">) {}
  async createFlow(input: { projectId: string; name?: unknown; description?: unknown; flowId?: string }): Promise<AutomationStudioFlowArtifact> {
    const legacyProject = this.authority ? undefined : await this.projects.findProject(input.projectId);
    const name = typeof input.name === "string" ? input.name.trim() : ""; if (!name) throw new Error("Flow name is required.");
    if (this.authority) {
      const description = typeof input.description === "string" && input.description.trim() ? input.description.trim() : undefined;
      if (input.flowId !== undefined) throw new Error("canonical_whole.caller_flow_id");
      return this.authority.createFlow(input.projectId, { name, ...(description === undefined ? {} : { description }) }, async flowId => {
        const project = await this.authority!.requireProject(input.projectId) as unknown as AutomationStudioProject;
        const flow = createBlankAutomationStudioFlowArtifact({ flowId, projectId: project.id, name, ...(description === undefined ? {} : { description }), scope: flowScopeForProject(project) });
        return this.writer.saveFlowInternal({ projectId: project.id, flow }, false);
      });
    }
    const project = legacyProject!, flowId = typeof input.flowId === "string" && input.flowId.trim() ? input.flowId.trim() : `flow.${randomUUID()}`;
    await this.flows.loadProjectFlow(project.id, flowId); if (await this.repositories.flows.get(flowId)) throw new Error(`Automation Studio Flow ID already exists: ${flowId}`);
    const saveInput = { projectId: project.id, flow: createBlankAutomationStudioFlowArtifact({ flowId, projectId: project.id, name, ...(typeof input.description === "string" && input.description.trim() ? { description: input.description.trim() } : {}), scope: flowScopeForProject(project) }) };
    return this.facade ? this.facade.saveFlow(saveInput) : this.writer.saveFlowInternal(saveInput, false);
  }
}
