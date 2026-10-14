// The supervisor plans from a short look (`../planning.ts`, `../look-budget.ts`,
// t569). Replays the shape of the first live `project` build,
// `run-mv7t07hx-fe96a174` (crossborder, steps 0003-0018): after the task, find
// after find on an unchanged start page -- one of them for the word "field" --
// and a describe, never a plan, until the run of looks stalled the round. Here
// the looks are withdrawn once the budget is spent, the model is told so with
// `project.write_plan` named, every look asked for after that is refused unrun,
// the no-progress redirect names the plan too, and a supervisor that then
// writes it goes on to dispatch, assemble and a yes.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_LOOK_BUDGET as BUDGET, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, call, complete, dispatch, lastOf, supervise, test, type Entry } from "./supervisor-script.ts";

const LOOK_TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "web.find_on_page", description: "Find words on the page.", effect: "observe", inputSchema: { type: "object" } },
  { toolId: "web.describe_element", description: "Describe one element.", effect: "observe", inputSchema: { type: "object" } }
];

/** The start page, unchanged by any look: every look matches nothing and leaves it as it found it. */
function startPage() {
  const ran: string[] = [];
  const executeTool = async ({ callId, toolId }: { callId: string; toolId: string }) => {
    ran.push(callId);
    return {
      kind: "llm_evidence_tool_execution" as const,
      evidence: { found: `0 matches (${toolId})` },
      effectApplied: false,
      resultCode: "web.inspect.succeeded",
      stateDigests: { before: "start", after: "start" },
      draft: { actionId: toolId, effect: "observe" as const, proposes: false }
    };
  };
  return { ran, executeTool };
}

const find = (query: string) => call("web.find_on_page", { query });
const describeIt = (target: string) => call("web.describe_element", { target });
const PLAN = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const BRIEF = { kind: "build", subflowKey: "find_newest", parts: ["p1"], allowanceUsd: 0.05, maxIterations: 20 };
const entries = (shown: readonly Entry[], toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

describe("the supervisor plans from a short look", () => {
  it("withdraws its looks once the budget is spent, names the plan as the way forward, and a written plan goes on to dispatch", async () => {
    const page = startPage();
    const run = await supervise([
      find("Ada Hart"), find("search"), find("field"),
      // Past the budget: the crossborder supervisor's next moves, each refused unrun.
      find("t8"), describeIt("t8"), find("Ada Hart titles"),
      call(IDS.writePlan, PLAN), dispatch([BRIEF]), call(IDS.assemble), test, complete
    ], project(), { tools: LOOK_TOOLS, executeTool: page.executeTool, maxStepsWithoutProgress: 8 });

    expect(BUDGET).toBe(3);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    // Only the budget's looks ran.
    expect(page.ran).toHaveLength(BUDGET);
    for (const offered of run.offered.slice(0, BUDGET)) expect(offered).toEqual(expect.arrayContaining(["web.find_on_page", "web.describe_element", IDS.writePlan]));
    for (const offered of run.offered.slice(BUDGET)) {
      expect(offered).not.toContain("web.find_on_page");
      expect(offered).not.toContain("web.describe_element");
      expect(offered).toEqual(expect.arrayContaining([IDS.writePlan, IDS.amendPlan, IDS.dispatch, IDS.assemble, IDS.testCandidate]));
    }
    // Told at once, naming the plan.
    const spent = entries(run.shown, "core.look_budget");
    expect(spent).toHaveLength(1);
    expect(spent[0]).toMatchObject({ code: "llm_evidence_loop.look_budget_spent", lookBudget: BUDGET, looksWithdrawn: true, next: IDS.writePlan });
    expect(String(spent[0]!.instruction)).toContain("project.write_plan");
    // Each look asked for after it is refused for the budget, not as an ignored redirect.
    const refusals = entries(run.shown, "core.decision_check");
    expect(refusals.length).toBeGreaterThanOrEqual(3);
    for (const refusal of refusals) expect(refusal.issueCodes).toEqual(["llm_evidence_loop.look_budget_spent"]);
    // The no-progress redirect names the plan, never a step to run or a draft.
    const redirect = entries(run.shown, "core.no_progress").at(-1);
    expect(redirect).toMatchObject({ code: "llm_evidence_loop.no_progress", next: IDS.writePlan, looksWithdrawn: true });
    expect(String(redirect!.instruction)).toContain("project.write_plan");
    expect(String(redirect!.instruction)).not.toMatch(/draft|run a step|press/u);
    // And the plan, once written, dispatches.
    expect(lastOf(run.shown, IDS.writePlan)).toMatchObject({ ok: true });
    expect(run.dispatched).toHaveLength(1);
  });

  it("ends a supervisor that never writes the plan on the no-progress guard, having run no look past the budget", async () => {
    const page = startPage();
    const looks = Array.from({ length: 12 }, (_value, index) => find(`query ${index}`));
    const run = await supervise(looks, project(), { tools: LOOK_TOOLS, executeTool: page.executeTool, maxStepsWithoutProgress: 6 });
    expect(page.ran).toHaveLength(BUDGET);
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.loop?.ok).toBe(false);
    expect(run.outcome.ending?.outcome).toBe("blocked");
    expect(run.dispatched).toHaveLength(0);
  });

  it("names the next planning step as the build moves on: brief once planned", async () => {
    const page = startPage();
    const run = await supervise([
      call(IDS.writePlan, PLAN), find("Ada Hart"), find("search"), find("field"), find("again"),
      dispatch([BRIEF]), call(IDS.assemble), test, complete
    ], project(), { tools: LOOK_TOOLS, executeTool: page.executeTool, maxStepsWithoutProgress: 8 });
    expect(entries(run.shown, "core.look_budget")[0]).toMatchObject({ next: IDS.dispatch });
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
  });
});
