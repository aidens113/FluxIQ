// The supervisor plans from a short look (`../planning.ts`, t569), and since page-diff D4 and D11 no look
// budget withdraws its look tools: its look tools stay on offer at every step of the run. Replays the shape of
// the first live `project` build, `run-mv7t07hx-fe96a174` (steps 0003-0018): look after look on an unchanged
// start page, then the plan. Here every look runs, nothing is taken from the offered list, and a supervisor
// that then writes the plan goes on to dispatch, assemble and a yes.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, call, complete, dispatch, lastOf, supervise, test } from "./supervisor-script.ts";

const LOOK_TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "web.describe_element", description: "Describe one element.", effect: "observe", inputSchema: { type: "object" } },
  { toolId: "web.detect_repeating_structure", description: "Detect a repeating structure.", effect: "observe", inputSchema: { type: "object" } }
];

/** The start page, unchanged by any look: every look leaves it as it found it. */
function startPage() {
  const ran: string[] = [];
  const executeTool = async ({ callId, toolId }: { callId: string; toolId: string }) => {
    ran.push(callId);
    return {
      kind: "llm_evidence_tool_execution" as const,
      evidence: { described: `nothing new (${toolId})` },
      effectApplied: false,
      resultCode: "web.inspect.succeeded",
      stateDigests: { before: "start", after: "start" },
      draft: { actionId: toolId, effect: "observe" as const, proposes: false }
    };
  };
  return { ran, executeTool };
}

const describeIt = (target: string) => call("web.describe_element", { target });
const PLAN = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const BRIEF = { kind: "build", subflowKey: "find_newest", parts: ["p1"], allowanceUsd: 0.05, maxIterations: 20 };

describe("the supervisor plans from a short look", () => {
  it("keeps its look tools on offer at every step, however many looks it makes, and a written plan goes on to dispatch", async () => {
    const page = startPage();
    const run = await supervise([
      describeIt("t1"), describeIt("t2"), describeIt("t3"), describeIt("t4"), describeIt("t5"),
      call(IDS.writePlan, PLAN), dispatch([BRIEF]), call(IDS.assemble), test, complete
    ], project(), { tools: LOOK_TOOLS, executeTool: page.executeTool, maxStepsWithoutProgress: 8 });

    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    // Every look ran: none was withdrawn, and none was refused.
    expect(page.ran).toHaveLength(5);
    for (const offered of run.offered) {
      expect(offered).toEqual(expect.arrayContaining(["web.describe_element", "web.detect_repeating_structure", IDS.writePlan]));
    }
    expect(run.shown.some((entry) => (entry.value as JsonObject | undefined)?.code === "llm_evidence_loop.look_budget_spent")).toBe(false);
    expect(lastOf(run.shown, IDS.writePlan)).toMatchObject({ ok: true });
    expect(run.dispatched).toHaveLength(1);
  });

  it("ends a supervisor that never writes the plan on the no-progress guard, with its looks never withdrawn", async () => {
    const page = startPage();
    const looks = Array.from({ length: 12 }, (_value, index) => describeIt(`t${index}`));
    const run = await supervise(looks, project(), { tools: LOOK_TOOLS, executeTool: page.executeTool, maxStepsWithoutProgress: 6 });
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.loop?.ok).toBe(false);
    expect(run.outcome.ending?.outcome).toBe("blocked");
    expect(run.dispatched).toHaveLength(0);
    for (const offered of run.offered) expect(offered).toContain("web.describe_element");
  });
});
