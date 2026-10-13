import type { AutomationStudioFlowArtifact, AutomationStudioFlowInstruction, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioRunControlSnapshot } from "../../run-control/index.ts";
import { AutomationInstructionError } from "./error.ts";
import { automationInstructionTasks } from "./task.ts";

type Ports = {
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
  assertOwnedSubflowGraph(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void>;
  instructions(projectId: string, flowId: string): Promise<readonly AutomationStudioFlowInstruction[]>;
  session(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
  resume(projectId: string, runId: string, input: { afterManualAction?: boolean; note?: string }): AutomationStudioRunControlSnapshot | null;
};

/** Resolves durable task ownership before admitting execution or releasing a live run. */
export class AutomationStudioInstructionAuthority {
  constructor(private readonly ports: Ports) {}

  async readiness(input: { projectId: string; flowId: string }): Promise<{ ready: boolean; instructionIds: string[]; diagnostic?: { code: string; message: string } }> {
    const flow = await this.ports.getFlow(input.projectId, input.flowId);
    let flowId = flow.flowId;
    if (flow.metadata?.subflowGraph === true) {
      await this.ports.assertOwnedSubflowGraph(input.projectId, flow);
      flowId = String(flow.metadata.parentFlowId);
      await this.ports.getFlow(input.projectId, flowId);
    }
    const tasks = automationInstructionTasks(await this.ports.instructions(input.projectId, flowId), input.projectId, flowId);
    const error = new AutomationInstructionError("automation.instructions_required");
    return tasks.length ? { ready: true, instructionIds: tasks.map(task => task.instructionId) } : { ready: false, instructionIds: [], diagnostic: { code: error.code, message: error.message } };
  }

  async assert(projectId: string | null | undefined, flowId: string | undefined): Promise<void> {
    if (!projectId || !flowId || !(await this.readiness({ projectId, flowId })).ready) throw new AutomationInstructionError("automation.instructions_required");
  }

  async resume(projectId: string, runId: string, input: { afterManualAction?: boolean; note?: string } = {}): Promise<AutomationStudioRunControlSnapshot | null> {
    const session = await this.ports.session(projectId, runId);
    if (!session) return null;
    await this.assert(projectId, session.flowId);
    return this.ports.resume(projectId, runId, input);
  }
}
