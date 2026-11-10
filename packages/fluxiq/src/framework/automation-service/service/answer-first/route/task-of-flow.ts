// Whether a task lives under a Flow, and where it starts (t885): what the chat's Run of that Flow
// starts in answer-first mode. A task's first attempt keeps its steps in the task's memory and leaves
// its Flow with no Router until a later attempt proves them whole (`../apply-proven/`), so the project
// run path has nothing to run there and failed at once ("Top-level orchestration Flow has no
// Router-selected Subflow execution path", run-mw9xfwvd-ccc692b2). A Run of a task's Flow is the
// task asked for again, and takes the road the same words take.
//
// **Where it starts** is the start place of the task the Flow's goal names now, as a press of Run
// again starts from (`../run-again/`): a Run names a Flow and no page. Where no remembered task is the
// one the goal names, but only one lives under the Flow, that one's; otherwise none, and the page on
// screen is used, as for the same words typed.
//
// **What cannot be read throws**, a Flow that is gone included: "no task here" is an answer, and a
// memory that could not be read is not one.

import type { AutomationStudioFlowInstruction } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioAnswerFirstGoalWords } from "../run-again/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemory, type AutomationStudioAnswerFirstTaskMemoryPorts } from "../task-memory/index.ts";

/** What this reads of the service, which is also the task memory's owner. */
type FlowReader = {
  getFlow(projectId: string, flowId: string): Promise<unknown>;
  getFlowInstructionSet(input: { projectId: string; flowId: string }): Promise<AutomationStudioFlowInstruction[]>;
};

export async function automationStudioAnswerFirstTaskOfFlow(service: FlowReader, ports: AutomationStudioAnswerFirstTaskMemoryPorts, input: { projectId: string; flowId: string }): Promise<{ startLocation?: string } | undefined> {
  await service.getFlow(input.projectId, input.flowId);
  const held = (await automationStudioAnswerFirstTaskMemoryOf(service, ports).list(input.projectId)).filter((memory) => homeOf(memory) === input.flowId);
  if (held.length === 0) return undefined;
  const goal = await automationStudioAnswerFirstGoalWords(service, input.projectId, input.flowId);
  const named = goal === undefined ? undefined : held.find((memory) => memory.taskId === automationStudioAnswerFirstTaskKey({ instructionText: goal, startLocation: memory.startLocation }));
  const chosen = named ?? (held.length === 1 ? held[0] : undefined);
  return chosen?.startLocation ? { startLocation: chosen.startLocation } : {};
}

/** The Flow a task lives under, as the known Flow reads it (`./known-flow.ts`). */
function homeOf(memory: AutomationStudioAnswerFirstTaskMemory): string | undefined {
  return memory.flowId || memory.best?.flowId || memory.latest?.flowId || undefined;
}
