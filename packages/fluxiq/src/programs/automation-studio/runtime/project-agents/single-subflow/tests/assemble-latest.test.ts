// The one assembly `project.assemble` and a single-subflow test share (t679,
// `../assemble-latest.ts`): after a single subflow's builder test passed as
// the judged whole run, `project.assemble` answers with that revision and its
// complete object, and makes no new revision; a plan of several subflows is
// assembled as before.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { planInput, project, subflow, taskSpecInput } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, HOLD, brief, call, complete, dispatch, end, lastOf, supervise, test } from "../../supervisor/tests/supervisor-script.ts";
import { singleBuild } from "./single-build.ts";

const ONE_PART = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const TWO_PARTS = planInput([subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const answersOf = (seen: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => seen.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

describe("project.assemble on a single-subflow plan", () => {
  it("answers with the revision the builder's test made and passed, its complete object unchanged, and no new revision", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), call(IDS.assemble), complete], singleBuild());
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    const dispatched = answersOf(run.seen, IDS.dispatch)[0]!;
    const assembled = lastOf(run.seen, IDS.assemble)!;
    expect(assembled).toMatchObject({ ok: true, sameRevision: true, latestTest: { verdict: "yes" }, complete: dispatched.complete, assembledFrom: [{ subflowKey: "find_newest", briefId: "brief-1" }], next: GUIDANCE.next.afterAssembleTested });
    // Only the builder's test ran, and the build completed on the revision it made.
    expect(run.trials).toHaveLength(1);
    expect(run.outcome.candidate).toMatchObject(dispatched.complete as JsonObject);
  });
});

describe("project.assemble on a plan of several subflows", () => {
  it("assembles a new revision as before, and its dispatch answer carries no complete object", async () => {
    const run = await supervise([call(IDS.writePlan, TWO_PARTS), dispatch([brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] })]), call(IDS.assemble), end("blocked")], project());
    const [first] = answersOf(run.seen, IDS.assemble);
    expect(first).toMatchObject({ ok: true, revision: 1, next: GUIDANCE.next.afterAssemble, calls: { inOrder: ["find_titles", "place_hold"] } });
    expect(first!.sameRevision).toBeUndefined();
    const dispatched = answersOf(run.seen, IDS.dispatch)[0]!;
    expect(dispatched.complete).toBeUndefined();
    expect(dispatched.next).toBe(GUIDANCE.next.afterReturnsDone);
  });

  it("assembles a single subflow's done proposal as a new revision when no whole test was made from it", async () => {
    // The supervisor fixture's own stub builders never test through the dispatch's whole test, so nothing was assembled from the proposal yet.
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), call(IDS.assemble), test, complete], project());
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(lastOf(run.seen, IDS.assemble)).toMatchObject({ ok: true, next: GUIDANCE.next.afterAssemble });
    expect(run.trials).toHaveLength(1);
  });
});
