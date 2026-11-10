// Whether a task lives under a Flow, and where it starts (t885): what the chat's Run of a task's Flow
// starts from. The start place of the task the Flow's goal names, else of the only task there, else none;
// and a Flow or a memory that cannot be read throws rather than reading as "no task".
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../../../flows/authoring/model/index.ts";
import { AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../../task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemoryPorts } from "../../task-memory/index.ts";
import { automationStudioAnswerFirstTaskOfFlow } from "../index.ts";

const ports = (): AutomationStudioAnswerFirstTaskMemoryPorts => ({ paths: new AutomationStudioProjectPaths(undefined), projects: { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioAnswerFirstTaskMemoryPorts["projects"] });
const LOANS = "List the books on loan to member 12";
const HOLDS = "List the holds waiting for member 12";
const DESK = "https://lending.example.test/desk";
const SHELF = "https://shelves.example.test/";

/** A service whose every Flow holds `goal` as its one active goal (none when undefined); `gone` Flows cannot be read. */
function serviceWith(goal: string | undefined, gone: readonly string[] = []) {
  return {
    async getFlow(_projectId: string, flowId: string) {
      if (gone.includes(flowId)) throw new Error(`Flow ${flowId} was not found.`);
      return { flowId };
    },
    async getFlowInstructionSet() {
      return (goal === undefined ? [] : [{ status: "active", scope: { kind: "flow" }, tags: ["generation"], body: goal }]) as unknown as AutomationStudioFlowInstruction[];
    }
  };
}

async function remembered(goal: string | undefined, tasks: Array<{ words: string; where?: string; flowId: string }>) {
  const service = serviceWith(goal, ["flow.gone"]);
  const p = ports();
  for (const task of tasks) {
    const taskId = automationStudioAnswerFirstTaskKey({ instructionText: task.words, startLocation: task.where });
    await automationStudioAnswerFirstTaskMemoryOf(service, p).update("project.1", taskId, (current) => ({ ...current, flowId: task.flowId, ...(task.where ? { startLocation: task.where } : {}) }));
  }
  return (flowId: string) => automationStudioAnswerFirstTaskOfFlow(service, p, { projectId: "project.1", flowId });
}

describe("the task a Flow holds", () => {
  it("is none for a Flow no task lives under", async () => {
    const of = await remembered(LOANS, [{ words: LOANS, where: DESK, flowId: "flow.loans" }]);
    await expect(of("flow.other")).resolves.toBeUndefined();
  });

  it("starts where the task the Flow's goal names starts, its words folded as the key folds them", async () => {
    const tasks = [{ words: LOANS, where: DESK, flowId: "flow.shared" }, { words: HOLDS, where: SHELF, flowId: "flow.shared" }];
    await expect((await remembered("list the books on loan to member 12.", tasks))("flow.shared")).resolves.toEqual({ startLocation: DESK });
    await expect((await remembered(HOLDS, tasks))("flow.shared")).resolves.toEqual({ startLocation: SHELF });
  });

  it("starts where the only task under the Flow starts when the goal names none, and nowhere it chose for several", async () => {
    await expect((await remembered("Something else entirely", [{ words: LOANS, where: DESK, flowId: "flow.loans" }]))("flow.loans")).resolves.toEqual({ startLocation: DESK });
    await expect((await remembered(undefined, [{ words: LOANS, where: DESK, flowId: "flow.loans" }]))("flow.loans")).resolves.toEqual({ startLocation: DESK });
    const several = await remembered("Something else entirely", [{ words: LOANS, where: DESK, flowId: "flow.shared" }, { words: HOLDS, where: SHELF, flowId: "flow.shared" }]);
    await expect(several("flow.shared")).resolves.toEqual({});
  });

  it("is a task's Flow with no start place where the task kept none", async () => {
    await expect((await remembered(LOANS, [{ words: LOANS, flowId: "flow.loans" }]))("flow.loans")).resolves.toEqual({});
  });

  it("throws for a Flow that is gone and a memory that cannot be read, never reading either as no task", async () => {
    await expect((await remembered(LOANS, []))("flow.gone")).rejects.toThrow("not found");
    const service = serviceWith(LOANS);
    const p = ports();
    automationStudioAnswerFirstTaskMemoryOf(service, p).list = async () => { throw new Error("unreadable"); };
    await expect(automationStudioAnswerFirstTaskOfFlow(service, p, { projectId: "project.1", flowId: "flow.loans" })).rejects.toThrow("unreadable");
  });
});
