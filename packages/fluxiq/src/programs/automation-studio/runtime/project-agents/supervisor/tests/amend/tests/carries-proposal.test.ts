// An amendment that only adds to a subflow carries its done proposal (A8
// towels `run-mvac0nmw`, t658). The supervisor moved a part that only shaped
// the rows into the subflow that read them and renamed its output; Core
// dropped that subflow's judged-yes proposal, which already stored what the
// moved part asked, and the build never earned it again. Now the proposal is
// carried: listed under proposalsCarried, named on the subflow's next build
// brief to start from, and never done until that brief's own trial says yes on
// every part. Any other change still drops it. A lending library's catalogue.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../index.ts";
import { planInput, project, subflow, taskSpecInput } from "../../supervisor-fixture.ts";
import { FIND, HOLD, NOTE, brief, call, complete, dispatch, end, supervise, test } from "../../supervisor-script.ts";

const SPEC = taskSpecInput([["p1", FIND, []], ["p2", NOTE, []]]);
/** find_titles reads the rows; shape_list only orders and chooses columns of them. */
const SPLIT = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("shape_list", ["p2"], { inputs: ["titles"], outputs: ["list"], after: ["find_titles"] })
], SPEC);
/** The shaping moved into find_titles, its output renamed: only added to. */
const FOLDED = { ...planInput([subflow("find_titles", ["p1", "p2"], { inputs: ["author"], outputs: ["list"] })], SPEC), reason: "Shaping the list belongs to the read." };
/** find_titles' script under the amended plan: the same steps, its output under the new name. */
const FOLDED_SCRIPT = ["flow: Find the titles", "part find_titles: find the titles", "  input: author", "  output: list = $step.rows.records", "  step rows: read the rows", "    node: web.dom.extract_list", "    extractList: extraction.1", "    extractList.minItems: 0", "  step: type the author", "    node: web.dom.type", "    selector: .author", "    text: $input.author", "end"];

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

describe("an amendment that only adds parts to a subflow or renames its outputs", () => {
  it("carries its done proposal: listed, named on the next build brief, and done only on that brief's own yes", async () => {
    const built = project({ script: (sent, attempt) => (sent.subflowKey === "find_titles" && attempt === 2 ? FOLDED_SCRIPT : undefined) });
    const run = await supervise([
      // The split is refused once as only reshaping (t658), and taken sent again.
      call(IDS.writePlan, SPLIT),
      call(IDS.writePlan, SPLIT),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, FOLDED),
      // Not done on the old trial: nothing to assemble yet.
      call(IDS.assemble),
      dispatch([brief("find_titles", ["p1", "p2"])]),
      call(IDS.assemble),
      test,
      complete
    ], built);
    const first = answersOf(run.shown, IDS.dispatch)[0]!;
    const revision = ((first.returns as JsonObject[])[0]!.proposal as JsonObject).revision as number;
    const proposal = built.proposals.get("brief-1")!;
    const amended = answersOf(run.shown, IDS.amendPlan)[0]!;
    expect(amended).toMatchObject({
      ok: true, written: "plan_revision", proposalsKept: [], proposalsDropped: [],
      proposalsCarried: [{ subflowKey: "find_titles", briefId: "brief-1", revision, addedParts: ["p2"], renamedOutputs: [{ from: "titles", to: "list" }], instruction: GUIDANCE.next.carried }]
    });
    expect(String(amended.next)).toContain("proposalsCarried");
    // Its old yes never judged p2: assembling on it is refused.
    expect(answersOf(run.shown, IDS.assemble)[0]).toMatchObject({ ok: false });
    // The next build brief of that subflow starts from the carried proposal.
    expect(run.dispatched[1]!.briefs[0]!.carriedFrom).toEqual({ briefId: "brief-1", revision: proposal.revision, digest: proposal.digest, addedParts: ["p2"], renamedOutputs: [{ from: "titles", to: "list" }] });
    expect(run.view!.record.briefs.at(-1)!.brief.carriedFrom).toMatchObject({ briefId: "brief-1", revision: proposal.revision });
    // Once that brief came back done, its own proposal is the one assembled.
    expect(answersOf(run.shown, IDS.assemble)[1]).toMatchObject({ ok: true, assembledFrom: [{ subflowKey: "find_titles", briefId: "brief-2" }] });
    expect(run.outcome.status).toBe("candidate");
  });

  it("never lets a brief as sent name a carried proposal", async () => {
    const run = await supervise([
      call(IDS.writePlan, FOLDED),
      dispatch([brief("find_titles", ["p1", "p2"], [], { carriedFrom: { briefId: "brief-9", revision: 1, digest: "f".repeat(64), addedParts: [], renamedOutputs: [] } })]),
      end("blocked")
    ], project({ script: () => FOLDED_SCRIPT }));
    expect(run.dispatched[0]!.briefs[0]).not.toHaveProperty("carriedFrom");
  });

  it("still drops the proposal when the amendment changes what runs before it, or changes a part it was built for", async () => {
    const TWO = planInput([
      subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
    ], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []]]));
    const amended = (plan: JsonObject) => supervise([call(IDS.writePlan, TWO), dispatch([brief("find_titles", ["p1"])]), call(IDS.amendPlan, plan), end("blocked")]);
    // A part added, and find_titles now runs after another subflow.
    const reordered = await amended({
      ...planInput([
        subflow("place_hold", ["p2"]),
        subflow("find_titles", ["p1", "p3"], { inputs: ["author"], outputs: ["titles"], after: ["place_hold"] })
      ], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []], ["p3", NOTE, []]])),
      reason: "Hold first, then read."
    });
    const reorderedAnswer = answersOf(reordered.shown, IDS.amendPlan)[0]!;
    expect(reorderedAnswer).toMatchObject({ ok: true, proposalsKept: [] });
    expect(reorderedAnswer).not.toHaveProperty("proposalsCarried");
    expect((reorderedAnswer.proposalsDropped as JsonObject[]).find((entry) => entry.subflowKey === "find_titles")!.why).toContain("what runs before it changed");
    // A part added, and the part it was built for asks a lasting act it did not.
    const changed = await amended({
      ...planInput([
        subflow("find_titles", ["p1", "p3"], { inputs: ["author"], outputs: ["titles"] }),
        subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
      ], taskSpecInput([["p1", FIND, ["create_new"]], ["p2", HOLD, []], ["p3", NOTE, []]])),
      reason: "Finding the titles saves them."
    });
    const changedAnswer = answersOf(changed.shown, IDS.amendPlan)[0]!;
    expect(changedAnswer).not.toHaveProperty("proposalsCarried");
    expect(changedAnswer).toMatchObject({ ok: true, proposalsKept: [], proposalsDropped: [{ subflowKey: "find_titles", why: ["its parts changed"] }] });
  });

  it("still drops the proposal when an output is lost, not renamed", async () => {
    const TWO_OUT = planInput([
      subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles", "count"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles", "count"], after: ["find_titles"] })
    ], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []]]));
    const lost = planInput([
      subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
    ], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []]]));
    const twoOutScript = ["flow: Find the titles", "part find_titles: find the titles", "  input: author", "  output: titles = $step.rows.records", "  output: count = $step.rows.records", "  step rows: read the rows", "    node: web.dom.extract_list", "    extractList: extraction.1", "    extractList.minItems: 0", "  step: type the author", "    node: web.dom.type", "    selector: .author", "    text: $input.author", "end"];
    const run = await supervise([call(IDS.writePlan, TWO_OUT), dispatch([brief("find_titles", ["p1"])]), call(IDS.amendPlan, { ...lost, reason: "The count is not needed." }), end("blocked")], project({ script: (sent) => (sent.subflowKey === "find_titles" ? twoOutScript : undefined) }));
    const answer = answersOf(run.shown, IDS.amendPlan)[0]!;
    expect(answer).not.toHaveProperty("proposalsCarried");
    expect(answer).toMatchObject({ ok: true, proposalsDropped: [{ subflowKey: "find_titles", why: ["its inputs or outputs changed"] }] });
  });
});
