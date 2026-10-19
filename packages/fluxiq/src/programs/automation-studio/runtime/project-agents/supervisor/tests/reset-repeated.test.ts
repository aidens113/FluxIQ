// A reset sent again right after one that came back not done, with what it
// left unchanged (social debug fix 5, t590). Social `run-mv85xmgq-8a6a6f43`
// sent the same reset twice; the second could only do the same, and pressed a
// control the task said to leave on the way. It is now answered without
// running: what the first left, and what to do now.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, HOLD, assembled, brief, call, dispatch, end, reset, supervise, test } from "./supervisor-script.ts";

const PLAN = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"], after: ["find_titles"] })
], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
/** Both builds; the second leaves one lasting act on the target. */
const BUILDS = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] })];

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

describe("a reset sent again after one that came back not done", () => {
  it("is not run while the target holds what the first left, and says what it left and to test", async () => {
    const run = await supervise([
      call(IDS.writePlan, PLAN),
      dispatch(BUILDS),
      call(IDS.assemble),
      dispatch([reset()], "Undo the hold before the test."),
      dispatch([reset()], "Try the undo again."),
      end("blocked")
    ], project({ ledger: { undoes: false } }));
    const answers = answersOf(run.shown, IDS.dispatch);
    expect(answers[1]).toMatchObject({ ok: true, returns: [{ kind: "reset", outcome: "blocked" }] });
    expect(answers[2]).toMatchObject({
      ok: false,
      code: "project.reset_repeated",
      instruction: GUIDANCE.refusals.resetRepeatedTest,
      lastReset: { briefId: "brief-3", outcome: "blocked", reason: "The site offers no control that undoes these acts." },
      leftOnTarget: [{ act: "act-1", brief: "brief-2", undoable: true }]
    });
    // The second reset was never handed to a builder.
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"], ["reset"]]);
  });

  it("says to end, or to assemble first, when nothing is assembled; and runs once something else changed the target", async () => {
    const before = await supervise([
      call(IDS.writePlan, PLAN),
      dispatch(BUILDS),
      dispatch([reset()]),
      dispatch([reset()]),
      end("blocked")
    ], project({ ledger: { undoes: false } }));
    expect(answersOf(before.shown, IDS.dispatch)[2]).toMatchObject({ code: "project.reset_repeated", instruction: GUIDANCE.refusals.resetRepeatedEnd });

    // A whole test sent in between -- admitted once the act the site cannot undo is named under cannotUndo --
    // leaves acts of its own, so the next reset has something new to undo, and runs.
    const after = await supervise([
      call(IDS.writePlan, PLAN),
      dispatch(BUILDS),
      call(IDS.assemble),
      dispatch([reset()]),
      call(IDS.testCandidate, (evidence) => ({ ...assembled(evidence), cannotUndo: ["act-1"] })),
      dispatch([reset()]),
      end("blocked")
    ], project({ ledger: { undoes: false }, trialActs: true }));
    expect(after.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"], ["reset"], ["reset"]]);
  });
});
