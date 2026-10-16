// An amendment from a single-subflow plan to a plan of several (t679): the
// subflow the router ran becomes one the router-run subflow Core adds calls,
// with inputs and outputs of its own, so its done proposal -- made and judged
// as the whole Flow by its builder's test (`../single-subflow-trial.ts`) -- is
// neither kept nor carried: the amendment drops it, saying its inputs or
// outputs changed, and a dependent never runs it as a predecessor. Its
// subflow's next build brief tests it on its own, as any part.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { planInput, subflow, taskSpecInput } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, HOLD, brief, call, dispatch, end, lastOf, supervise } from "../../supervisor/tests/supervisor-script.ts";
import { singleBuild } from "./single-build.ts";

const SPEC = taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]);
const ONE_SUBFLOW = planInput([subflow("find_newest", ["p1", "p2"])], SPEC);
const TWO_SUBFLOWS = { ...planInput([subflow("find_newest", ["p1"]), subflow("place_hold", ["p2"], { after: ["find_newest"] })], SPEC), reason: "Placing the hold is its own subflow after the find." };

describe("an amendment from a single-subflow plan to several", () => {
  it("drops the single-path proposal, its inputs and outputs changed, so no dependent runs it as a predecessor", async () => {
    const built = singleBuild();
    const run = await supervise([
      call(IDS.writePlan, ONE_SUBFLOW),
      dispatch([brief("find_newest", ["p1", "p2"], [], { permittedActs: ["create_new"] })]),
      call(IDS.amendPlan, TWO_SUBFLOWS),
      end("blocked", "The plan changed.")
    ], built);
    // The single path's test passed: the subflow's done proposal is the one the amendment reads.
    expect(built.answers[0]).toMatchObject({ trial: { verdict: "yes" } });
    const amended = lastOf(run.seen, IDS.amendPlan)!;
    expect(amended).toMatchObject({ ok: true, proposalsKept: [] });
    expect(amended.proposalsCarried ?? []).toEqual([]);
    const dropped = amended.proposalsDropped as JsonObject[];
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ subflowKey: "find_newest" });
    expect(JSON.stringify(dropped[0])).toContain("its inputs or outputs changed");
    // What the build keeps of earlier plans for the plan in force names no subflow (`ports.kept`): no predecessor runs it.
    expect(run.kept.at(-1)?.madeUnder.size ?? 0).toBe(0);
  });
});
