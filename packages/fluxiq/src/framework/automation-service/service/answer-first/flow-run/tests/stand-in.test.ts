// The step a saved Flow broke at leaves the Flow where the attempt did its work by hand and put that
// in the Flow (`../stand-in.ts`), and nowhere else. Plain draft steps, no service: a lending library's
// nodes, which are none of the Lab's realistic scenarios.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstStandIn, type AutomationStudioAnswerFirstFlowRunOutcome } from "../index.ts";

const RUN_NODE = "core.run_node";
const OPEN = "domain.library.open_account";
const READ = "domain.library.read_loans";
const RENEW = "domain.library.renew_card";
const PAY = "domain.library.pay_fine";

type Step = AutomationStudioFlowDraftStep;

function step(position: number, id: string, node: string, parameters: JsonObject, over: Partial<Step> = {}): Step {
  return { position, id, iteration: position, actionId: node, toolId: RUN_NODE, input: { node, parameters }, effect: node === READ ? "observe" : "mutate", disposition: "kept", proposes: true, ...over };
}

/** The Flow attempt 1 saved: the account opened, the loans read, the card renewed, a fine paid. */
const saved = (): Step[] => [step(1, "d1", OPEN, {}), step(2, "d2", READ, {}), step(3, "d3", RENEW, { control: "Renew card" }), step(4, "d4", PAY, { control: "Pay" })];

/** The saved Flow's run, stopped at `at`: what came before passed, and nothing after it was reached. */
function brokeAt(at: number, steps: readonly Step[]): NonNullable<Parameters<typeof automationStudioAnswerFirstStandIn>[0]["flowRun"]> {
  const outcome: AutomationStudioAnswerFirstFlowRunOutcome = {
    kind: "ran", reachedEnd: false,
    steps: steps.map((each) => ({ position: each.position, ran: each.position < at ? "passed" as const : each.position === at ? "failed" as const : "not_reached" as const })),
    failing: { position: at, happened: "The step's control was not found on the page." }
  };
  return { outcome, wentOut: true };
}

function attempt(steps: Step[], at = 3, forwardPassed: readonly string[] = []) {
  const startedWith = saved();
  return { flowRun: brokeAt(at, startedWith), startedWith, steps, forwardPassed: new Set(forwardPassed) };
}

const inTheFlow = (steps: readonly Step[]) => steps.filter(automationStudioFlowDraftStepIsProposed).map((each) => [each.id, each.actionId, (each.input.parameters as JsonObject).control ?? null]);

describe("the step a saved Flow broke at", () => {
  it("leaves the Flow for the same node done by hand after it, which takes its place, its acts and the node it stood for", async () => {
    const run = attempt([...saved().map((each) => each.id === "d3" ? { ...each, acts: ["a1"] } : each), step(5, "d5", RENEW, { control: "Extend card" })]);
    expect(automationStudioAnswerFirstStandIn(run)).toBe(true);
    expect(inTheFlow(run.steps)).toEqual([["d1", OPEN, null], ["d2", READ, null], ["d5", RENEW, "Extend card"], ["d4", PAY, "Pay"]]);
    const fix = run.steps.find((each) => each.id === "d5")!;
    expect(fix).toMatchObject({ position: 3, standsFor: "d3", acts: ["a1"] });
    // The broken step stays listed at the end as the receipt of what replaced it, out of the Flow.
    expect(run.steps.at(-1)).toMatchObject({ id: "d3", disposition: "dropped", replacedBy: "d5" });
    expect(run.steps.map((each) => each.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("brings the steps made on the way to the fix with it, in their order, and a saved step between stays after them", async () => {
    // By hand from the page the run left: the account opened again, then the renamed control pressed.
    const run = attempt([...saved(), step(5, "d5", OPEN, { again: true }), step(6, "d6", RENEW, { control: "Extend card" })]);
    expect(automationStudioAnswerFirstStandIn(run)).toBe(true);
    expect(inTheFlow(run.steps).map(([id]) => id)).toEqual(["d1", "d2", "d5", "d6", "d4"]);
  });

  it("stays where nothing done by hand stands in for it: another node, a step only looked at, or a step left out of the Flow", async () => {
    for (const other of [step(5, "d5", PAY, { control: "Pay now" }), step(5, "d5", RENEW, { control: "Extend card" }, { disposition: "taken" }), step(5, "d5", RENEW, { control: "Extend card" }, { effectApplied: false, proposes: false })]) {
      const run = attempt([...saved(), other]);
      const before = JSON.stringify(run.steps);
      expect(automationStudioAnswerFirstStandIn(run)).toBe(false);
      expect(JSON.stringify(run.steps)).toBe(before);
    }
  });

  it("stays where a forward run got through it since: it works on the site as it stands", async () => {
    const run = attempt([...saved(), step(5, "d5", RENEW, { control: "Extend card" })], 3, ["d3", "d4"]);
    expect(automationStudioAnswerFirstStandIn(run)).toBe(false);
    expect(inTheFlow(run.steps).map(([id]) => id)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
  });

  it("stays where it is a repeat: one row done by hand does not do the act to every row", async () => {
    const steps = [...saved().map((each) => each.id === "d3" ? { ...each, routing: { kind: "repeat" as const, through: "d3", over: "d2" } } : each), step(5, "d5", RENEW, { control: "Extend card" })];
    const run = { ...attempt(steps), startedWith: steps.slice(0, 4) };
    expect(automationStudioAnswerFirstStandIn(run)).toBe(false);
    expect(inTheFlow(run.steps).map(([id]) => id)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
  });

  it("does nothing where the run reached its end or never went out", async () => {
    const run = attempt([...saved(), step(5, "d5", RENEW, { control: "Extend card" })]);
    expect(automationStudioAnswerFirstStandIn({ ...run, flowRun: { outcome: { kind: "ran", reachedEnd: true, steps: [] }, wentOut: true } })).toBe(false);
    expect(automationStudioAnswerFirstStandIn({ ...run, flowRun: { ...run.flowRun, wentOut: false } })).toBe(false);
    expect(automationStudioAnswerFirstStandIn({ ...run, flowRun: undefined })).toBe(false);
  });
});
