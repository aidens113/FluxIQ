// What the supervisor is told around a `project.amend_plan` (bigbox debug C2
// and C4, t588). On A8 launch 6 the supervisor amended its plan, then sent a
// brief whose predecessor's proposal the amendment had made stop counting, and
// was refused three times with an issue naming only a path. A dispatch's
// return now lists each trial's receipt ref, as a repair's failingReceipt names
// one, and a refused predecessor is named, with why it does not count.
//
// An amendment now keeps the done proposal of a subflow it leaves as it was
// (t590): the dependent is sent on it and assembled with it, the build is told
// which it kept, and the amendment's answer lists what it kept and dropped.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../index.ts";
import { planInput, subflow, taskSpecInput } from "../../supervisor-fixture.ts";
import { FIND, HOLD, NOTE, brief, call, complete, dispatch, end, supervise, test } from "../../supervisor-script.ts";

const TWO = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []]]));
const THREE = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"], after: ["find_titles"] }),
  subflow("note_shelf", ["p3"], { inputs: ["shelf"], after: ["place_hold"] })
], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []], ["p3", NOTE, []]]));
/** THREE with the first part's lasting acts changed: its words are the same, what its builder was judged on is not. */
const THREE_FIRST_CHANGED = planInput((THREE.subflows as JsonObject[]), taskSpecInput([["p1", FIND, ["create_new"]], ["p2", HOLD, []], ["p3", NOTE, []]]));
/** THREE with the second part's lasting acts changed, and so the third, which runs after it. */
const THREE_SECOND_CHANGED = planInput((THREE.subflows as JsonObject[]), taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]], ["p3", NOTE, []]]));

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

describe("a dispatch around an amended plan", () => {
  it("returns each trial's receipt ref, and names a predecessor the amendment dropped, and why", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...THREE_FIRST_CHANGED, reason: "The shelf is a third part, and finding the titles saves them." }),
      dispatch([brief("place_hold", ["p2"], ["find_titles"])]),
      dispatch([brief("place_hold", ["p2"], ["note_shelf"])]),
      end("blocked")
    ]);
    const answers = answersOf(run.shown, IDS.dispatch);
    expect(answers[0]).toMatchObject({ ok: true, returns: [{ subflowKey: "find_titles", outcome: "done", trials: [{ kind: "subflow_trial", receiptId: "trial-brief-1", digest: "c".repeat(64) }] }] });
    expect(answersOf(run.shown, IDS.amendPlan)[0]).toMatchObject({ ok: true, proposalsKept: [], proposalsDropped: [{ subflowKey: "find_titles", why: ["its parts changed"] }] });
    expect(answers[1]).toMatchObject({ ok: false, code: "project.predecessor_not_done" });
    const [dropped] = answers[1]!.issues as JsonObject[];
    expect(dropped).toMatchObject({ code: "project.predecessor_not_done", path: "briefs.0.entry.predecessors.0", predecessor: "find_titles" });
    expect(dropped!.why).toBe("\"find_titles\" had a done proposal only under an earlier plan, and project.amend_plan dropped it: its parts changed. Send a build or repair brief for \"find_titles\" before this one, or in this same call.");
    const [never] = answers[2]!.issues as JsonObject[];
    expect(never).toMatchObject({ predecessor: "note_shelf", why: "\"note_shelf\" has no done proposal under this plan, and no brief in this call builds it. Send a build or repair brief for \"note_shelf\" before this one, or in this same call." });
    expect(run.dispatched).toHaveLength(1);
  });

  it("keeps the proposal of a subflow the amendment left as it was: the build is told, its dependent is sent on it, and the Flow is assembled from it", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...THREE, reason: "The shelf is a third part." }),
      dispatch([brief("place_hold", ["p2"], ["find_titles"])]),
      dispatch([brief("note_shelf", ["p3"], ["place_hold"])]),
      call(IDS.assemble),
      test,
      complete
    ]);
    const plans = run.view!.record.plans.map((entry) => entry.plan.digest);
    expect(answersOf(run.shown, IDS.amendPlan)[0]).toMatchObject({ ok: true, written: "plan_revision", proposalsKept: [{ subflowKey: "find_titles", briefId: "brief-1" }], proposalsDropped: [] });
    expect(answersOf(run.shown, IDS.amendPlan)[0]!.next).toContain("needs no brief");
    // Each plan that came into force told the build what it kept: nothing, then the first part's proposal, made under the first plan.
    expect(run.kept).toEqual([{ planDigest: plans[0], madeUnder: new Map() }, { planDigest: plans[1], madeUnder: new Map([["find_titles", plans[0]]]) }]);
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.subflowKey))).toEqual([["find_titles"], ["place_hold"], ["note_shelf"]]);
    expect(answersOf(run.shown, IDS.assemble)[0]).toMatchObject({ ok: true, assembledFrom: [{ subflowKey: "find_titles", briefId: "brief-1" }, { subflowKey: "place_hold", briefId: "brief-2" }, { subflowKey: "note_shelf", briefId: "brief-3" }], calls: { inOrder: ["find_titles", "place_hold", "note_shelf"] } });
    expect(run.outcome.status).toBe("candidate");
  });

  it("lists what an amendment kept and dropped, a subflow after a dropped one dropped with it", async () => {
    const run = await supervise([
      call(IDS.writePlan, THREE),
      dispatch([brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"]), brief("note_shelf", ["p3"], ["place_hold"])]),
      call(IDS.amendPlan, { ...THREE_SECOND_CHANGED, reason: "Placing the hold makes one." }),
      end("blocked")
    ]);
    expect(answersOf(run.shown, IDS.amendPlan)[0]).toMatchObject({
      proposalsKept: [{ subflowKey: "find_titles", briefId: "brief-1" }],
      proposalsDropped: [{ subflowKey: "place_hold", why: ["its parts changed"] }, { subflowKey: "note_shelf", why: ["it runs after \"place_hold\", which is not kept"] }]
    });
  });

  // Bigbox `run-mv8c7unr-42a8456d` reworded one part's facts and gave another's words a leading word, and lost a passing proposal (t595).
  // Its facts are what that proposal's trial was judged against, so facts that changed still drop it (supervisor decision, t595).
  it("keeps a proposal whose part's words moved by a word at an end, naming it; drops one whose facts changed, or whose words were cut further", async () => {
    const respoken = (text: string, fact: string) => planInput((TWO.subflows as JsonObject[]), {
      parts: [{ id: "p1", quote: { sourceId: "instruction.1", text }, goalFacts: [fact], lastingActs: [] }, { id: "p2", quote: { sourceId: "instruction.1", text: HOLD }, goalFacts: [`${HOLD} is done`], lastingActs: [] }],
      notAsked: ["borrowing any title"]
    });
    const amended = (plan: JsonObject) => supervise([
      call(IDS.writePlan, TWO),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...plan, reason: "Say the first part more plainly." }),
      end("blocked")
    ]);
    // The words lose their first word; the fact differs only in case and spacing.
    const reworded = await amended(respoken("the three newest titles by Ada Hart", `  ${FIND.toLowerCase()}   is done `));
    expect(answersOf(reworded.shown, IDS.amendPlan)[0]).toMatchObject({ ok: true, proposalsKept: [{ subflowKey: "find_titles", briefId: "brief-1", reworded: ["p1"] }], proposalsDropped: [] });
    // Spacing and case alone are no rewording: kept, and not listed as reworded.
    const spaced = await amended(respoken(FIND, `${FIND.toUpperCase()}  IS DONE`));
    expect(answersOf(spaced.shown, IDS.amendPlan)[0]).toMatchObject({ ok: true, proposalsKept: [{ subflowKey: "find_titles", briefId: "brief-1" }], proposalsDropped: [] });
    expect((answersOf(spaced.shown, IDS.amendPlan)[0]!.proposalsKept as JsonObject[])[0]).not.toHaveProperty("reworded");
    const facts = await amended(respoken("the three newest titles by Ada Hart", "the three titles are shown on the page"));
    expect(answersOf(facts.shown, IDS.amendPlan)[0]).toMatchObject({ ok: true, proposalsKept: [], proposalsDropped: [{ subflowKey: "find_titles", why: ["its facts changed"] }] });
    // Cut further, its first words now a part of their own (an amendment may not drop them, t645): its parts changed.
    const split = respoken("newest titles by Ada Hart", `${FIND} is done`);
    (split.taskSpec as { parts: JsonObject[] }).parts.unshift({ id: "p0", quote: { sourceId: "instruction.1", text: "Find the three" }, goalFacts: ["three are asked for"], lastingActs: [] });
    const cut = await amended({ ...split, subflows: (TWO.subflows as JsonObject[]).map((entry, index) => (index === 0 ? { ...entry, parts: ["p0", "p1"] } : entry)) });
    expect(answersOf(cut.shown, IDS.amendPlan)[0]).toMatchObject({ ok: true, proposalsKept: [], proposalsDropped: [{ subflowKey: "find_titles", why: ["its parts changed"] }] });
  });

  // The same run's first amendment was refused with a code and a path and no words (t595).
  it("refuses an amendment with what each issue means in words", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO),
      call(IDS.amendPlan, { ...planInput([...(TWO.subflows as JsonObject[]), { key: "extra", name: "Extra", parts: [] }], TWO.taskSpec as JsonObject), reason: "Add a step." }),
      end("blocked")
    ]);
    expect(answersOf(run.shown, IDS.amendPlan)[0]).toMatchObject({ ok: false, code: "project.plan_refused", issues: [{ code: "project.plan_subflow_no_parts", path: "subflows.2.parts", why: GUIDANCE.planIssues["project.plan_subflow_no_parts"] }] });
  });
});
