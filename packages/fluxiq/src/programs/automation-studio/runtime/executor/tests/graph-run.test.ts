import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, runAutomationStudioGraph, type AutomationStudioGraphExecutionTrace } from "../index.ts";

// Obviously synthetic: every assertion about these is where they must not appear.
const SUPPLIED = "synthetic-run-input-that-must-never-be-persisted";
const SUPPLIED_NUMBER = 8830417;

const authoredFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.unread-input",
  ownerKind: "task",
  ownerId: "task.unread-input",
  name: "Unread input",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm", retries: 3 } } }],
  edges: []
};

describe("a run input no node reads, and the persisted trace", () => {
  it("withholds it from the run's values and every attempt's inputs, keeping its key, while the Flow's authored values stay", async () => {
    const withheldTexts: Array<string[] | undefined> = [];
    const trace = await runAutomationStudioGraph(authoredFlow, {
      inputs: { "run.unread.text": SUPPLIED, "run.unread.count": SUPPLIED_NUMBER, "run.unread.flag": true },
      effectDispatcher: (_effect, context) => {
        withheldTexts.push(context?.withheldValues?.texts);
        return { status: "success", route: "success", outputs: { ok: true } };
      }
    });

    expect(trace.status).toBe("succeeded");
    expect(JSON.stringify(trace)).not.toContain(SUPPLIED);
    expect(JSON.stringify(trace)).not.toContain(String(SUPPLIED_NUMBER));
    const withheldInputs = { "run.unread.text": AUTOMATION_STUDIO_WITHHELD_VALUE, "run.unread.count": AUTOMATION_STUDIO_WITHHELD_VALUE, "run.unread.flag": true };
    expect(trace.values).toMatchObject(withheldInputs);
    expect(trace.attempts[0]?.inputs).toMatchObject(withheldInputs);
    expect(trace.effects[0]?.payload).toMatchObject({ outputId: "activate-element", parameters: { elementId: "confirm", retries: 3 } });
    // No binding resolved it, so no dispatch is told to withhold it, and no command carries it.
    expect(withheldTexts).toEqual([undefined]);
  });

  it("keeps a value the run computed even when it equals an input", async () => {
    const trace = await runAutomationStudioGraph({
      ...authoredFlow,
      flowId: "flow.computed-equals-input",
      nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0 } }],
      edges: [{ id: "start.sum", sourceNodeId: "start", targetNodeId: "sum", sourcePortId: "success", targetPortId: "in" }]
    }, { inputs: { left: 5, right: 0 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.values).toMatchObject({ left: AUTOMATION_STUDIO_WITHHELD_VALUE, right: AUTOMATION_STUDIO_WITHHELD_VALUE, result: 5 });
  });

  it("hands a caller that goes on executing the trace as the run executed it, beside the saved trace it returns", async () => {
    const handed: Array<{ executed: AutomationStudioGraphExecutionTrace; saved: AutomationStudioGraphExecutionTrace }> = [];
    const trace = await runAutomationStudioGraph(authoredFlow, {
      inputs: { "run.unread.text": SUPPLIED },
      effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true } })
    }, (executed, saved) => { handed.push({ executed, saved }); });

    expect(handed).toHaveLength(1);
    expect(handed[0]?.saved).toBe(trace);
    expect(handed[0]?.executed.values["run.unread.text"]).toBe(SUPPLIED);
    expect(handed[0]?.executed.attempts[0]?.inputs["run.unread.text"]).toBe(SUPPLIED);
    expect(trace.values["run.unread.text"]).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(JSON.stringify(trace)).not.toContain(SUPPLIED);
  });
});
