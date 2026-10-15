// What a call of reset briefs only says to do next (crossborder debug, t638).
// A8 wave 10 `run-mv9q50ui-1736d010` sent a reset because its ending was held
// for one (`project.completion_reset_first`), and the reset's answer told it to
// test the latest assembled Flow, which it never had. The answer now says to end
// again where nothing is assembled or the latest Flow cannot be tested again,
// and puts ending again first where it may be tested.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, project, subflow, taskSpecInput, type BuilderPlan } from "./supervisor-fixture.ts";
import { FIND, HOLD, NOTE, brief, call, dispatch, end, reset, supervise, test, type Entry } from "./supervisor-script.ts";

const THREE_PART = planInput(
  [subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] }), subflow("note_shelf", ["p3"], { inputs: ["shelf"] })],
  taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]], ["p3", NOTE, []]])
);
const ONE_PART = planInput([subflow("main", ["p2"])], taskSpecInput([["p2", HOLD, ["create_new"]]]));

const nexts = (shown: readonly Entry[]) => shown.filter((entry) => entry.toolId === IDS.dispatch).map((entry) => (entry.value as JsonObject).next);

describe("the answer to a reset", () => {
  it("says to end again when nothing is assembled, never to test a Flow", async () => {
    const builder: BuilderPlan = (sent) => (sent.subflowKey === "note_shelf" ? "blocked" : "done");
    const briefs = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] }), brief("note_shelf", ["p3"], ["place_hold"])];
    const run = await supervise([
      call(IDS.writePlan, THREE_PART),
      dispatch(briefs),
      end("blocked", "The shelf is not shown."),
      dispatch([reset()], "Put the target back before ending."),
      end("blocked", "The shelf is not shown.")
    ], project({ builder }));
    expect(run.feedback.map((entry) => entry.code)).toEqual(["project.completion_reset_first"]);
    expect(nexts(run.shown).at(-1)).toBe(GUIDANCE.next.afterResetNothingAssembled);
    expect(GUIDANCE.next.afterResetNothingAssembled).not.toContain("core.test_candidate");
    expect(GUIDANCE.next.afterResetNothingAssembled).toContain("end again");
    expect(run.outcome.ending).toMatchObject({ outcome: "blocked", reason: "The shelf is not shown." });
  });

  it("says to end again, or complete on a yes, when the latest assembled Flow cannot be tested again", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p2"], [], { permittedActs: ["create_new"] })]),
      call(IDS.assemble),
      dispatch([reset()], "Put the target back before the whole test."),
      test,
      dispatch([reset()], "Put the target back before ending."),
      end("blocked")
    ], project({ trial: () => "no", trialActs: true }));
    expect(nexts(run.shown).slice(1)).toEqual([GUIDANCE.next.afterReset, GUIDANCE.next.afterResetNothingToTest]);
    expect(GUIDANCE.next.afterResetNothingToTest).not.toContain("core.test_candidate");
  });

  it("puts ending again first, then the test, while the latest assembled Flow may be tested", () => {
    const words = GUIDANCE.next.afterReset;
    expect(words).toContain("project.completion_reset_first");
    expect(words.indexOf("end again")).toBeGreaterThan(-1);
    expect(words.indexOf("end again")).toBeLessThan(words.indexOf("core.test_candidate"));
  });
});
