// Finished work survives a narrowing and a merge (Lab `run-mvan7giv`, t671).
// That run's supervisor removed a value its first subflow handed on, which no
// subflow took any more, and later merged its two subflows into one; each time
// Core dropped the done proposal and the build paid for it again from the
// start page. Now the narrowed proposal is carried on its own key and the
// merged one onto the subflow that holds its parts: listed under
// proposalsCarried with why, named on the next build brief to start from, and
// never done until that brief's own trial says yes. So is one whose part's
// facts or lasting acts changed (supervisor decision, reversing t595). What
// else changed still drops it, and the answer says which part changed and how. A lending
// library's catalogue.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../index.ts";
import { planInput, project, subflow, taskSpecInput } from "../../supervisor-fixture.ts";
import { FIND, HOLD, NOTE, brief, call, complete, dispatch, end, supervise, test } from "../../supervisor-script.ts";

const SPEC = taskSpecInput([["p1", FIND, []], ["p2", HOLD, []]]);
/** SPEC with the shelf noted too, a third part. */
const SPEC3 = taskSpecInput([["p1", FIND, []], ["p2", HOLD, []], ["p3", NOTE, []]]);
/** Finding the titles and noting the shelf, with no hold. */
const SPEC13 = taskSpecInput([["p1", FIND, []], ["p3", NOTE, []]]);
/** find_titles hands on the titles and their count; place_hold takes both. */
const COUNTED = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles", "count"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles", "count"], after: ["find_titles"] })
], SPEC);
/** COUNTED with the count gone: no subflow takes it any more. */
const NARROWED = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
], SPEC);
/** find_titles takes nothing and hands on the titles, which place_hold takes. */
const SPLIT = planInput([
  subflow("find_titles", ["p1"], { outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
], SPEC);

/** Each subflow's script, as its builder writes it under the plan each test gives it; a part reads every input it declares (t581). */
const SCRIPTS: Record<string, string[]> = {
  counted: ["flow: Find the titles", "part find_titles: find the titles", "  input: author", "  output: titles = $step.rows.records", "  output: count = $step.rows.records", "  step rows: read the rows", "    node: web.dom.extract_list", "    extractList: extraction.1", "    extractList.minItems: 0", "  step: type the author", "    node: web.dom.type", "    selector: .author", "    text: $input.author", "end"],
  uninput: ["flow: Find the titles", "part find_titles: find the titles", "  output: titles = $step.rows.records", "  step rows: read the rows", "    node: web.dom.extract_list", "    extractList: extraction.1", "    extractList.minItems: 0", "end"],
  hold: ["flow: Place a hold", "part place_hold: place the hold", "  input: titles", "  step: type the titles", "    node: web.dom.type", "    selector: .titles", "    text: $input.titles", "end"],
  routed: ["flow: Find the titles and hold one", "step: open the catalogue", "  node: web.browser.navigate", "  url: https://library.test/catalogue"],
  find: ["flow: Find the titles", "part find_titles: find the titles", "  step: open the catalogue", "    node: web.browser.navigate", "    url: https://library.test/catalogue", "end"],
  note: ["flow: Note the shelf", "part note_shelf: note the shelf", "  step: open the holds", "    node: web.browser.navigate", "    url: https://library.test/holds", "end"]
};

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);
const amendOf = (run: { shown: ReadonlyArray<{ toolId: string; value: unknown }> }) => answersOf(run.shown, IDS.amendPlan)[0]!;

describe("an amendment that narrows a done subflow or merges it into another", () => {
  it("carries a proposal whose subflow only lost an output no subflow takes: listed with why, named on its next build brief, done only on that brief's yes", async () => {
    const built = project({ script: (sent, attempt) => (sent.subflowKey === "find_titles" ? (attempt === 1 ? SCRIPTS.counted : undefined) : sent.subflowKey === "place_hold" ? SCRIPTS.hold : undefined) });
    const run = await supervise([
      call(IDS.writePlan, COUNTED),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...NARROWED, reason: "Nothing uses the count." }),
      // Not done on the old trial: nothing to assemble yet.
      call(IDS.assemble),
      dispatch([brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"])]),
      call(IDS.assemble),
      test,
      complete
    ], built);
    const proposal = built.proposals.get("brief-1")!;
    const amended = amendOf(run);
    expect(amended).toMatchObject({ ok: true, proposalsKept: [], proposalsDropped: [], proposalsCarried: [{ subflowKey: "find_titles", briefId: "brief-1", revision: proposal.revision, why: ["its inputs or outputs changed"], removedOutputs: ["count"] }] });
    const [carried] = amended.proposalsCarried as JsonObject[];
    expect(carried).not.toHaveProperty("absorbed");
    expect(String(carried!.because)).toContain("removed its outputs \"count\"");
    expect(answersOf(run.shown, IDS.assemble)[0]).toMatchObject({ ok: false });
    expect(run.dispatched[1]!.briefs[0]!.carriedFrom).toEqual({ briefId: "brief-1", revision: proposal.revision, digest: proposal.digest, addedParts: [], renamedOutputs: [], removedOutputs: ["count"] });
    expect(answersOf(run.shown, IDS.assemble)[1]).toMatchObject({ ok: true, assembledFrom: [{ subflowKey: "find_titles", briefId: "brief-2" }, { subflowKey: "place_hold", briefId: "brief-3" }] });
    expect(run.outcome.status).toBe("candidate");
  });

  it("drops a proposal whose subflow lost an input its steps read", async () => {
    const run = await supervise([
      call(IDS.writePlan, NARROWED),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...SPLIT, reason: "The author is fixed." }),
      end("blocked")
    ]);
    const amended = amendOf(run);
    expect(amended).not.toHaveProperty("proposalsCarried");
    expect(amended).toMatchObject({ ok: true, proposalsKept: [], proposalsDropped: [{ subflowKey: "find_titles", why: ["its inputs or outputs changed", "its steps read the input \"author\", which the plan no longer gives it"] }] });
  });

  it("never says its parts changed when they did not, and carries one whose part's lasting act changed, naming the part and how", async () => {
    const amended = (plan: JsonObject) => supervise([call(IDS.writePlan, COUNTED), dispatch([brief("find_titles", ["p1"])]), call(IDS.amendPlan, { ...plan, reason: "Nothing uses the count." }), end("blocked")], project({ script: (sent) => (sent.subflowKey === "find_titles" ? SCRIPTS.counted : undefined) }));
    // The same parts, the count still taken: dropped for that alone.
    const taken = amendOf(await amended(planInput([
      subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles", "count"], after: ["find_titles"] })
    ], SPEC)));
    expect((taken.proposalsDropped as JsonObject[])[0]!.why).not.toContain("its parts changed");
    expect((taken.proposalsDropped as JsonObject[])[0]).not.toHaveProperty("changedParts");
    // As on the Lab run: the count removed and the part's lasting act rewritten. Carried (supervisor decision, t671), saying which part and how.
    const rewritten = amendOf(await amended(planInput(NARROWED.subflows as JsonObject[], taskSpecInput([["p1", FIND, ["create_new"]], ["p2", HOLD, []]]))));
    expect(rewritten).toMatchObject({
      proposalsDropped: [],
      proposalsCarried: [{ subflowKey: "find_titles", why: ["its inputs or outputs changed", "its parts changed"], removedOutputs: ["count"], changedParts: [{ part: "p1", what: "its lasting acts changed, from none to create_new" }] }]
    });
    expect(String((rewritten.proposalsCarried as JsonObject[])[0]!.because)).toContain("changed the part \"p1\"");
  });

  it("carries a proposal onto the new subflow it was merged into, which the router now runs", async () => {
    const built = project({ script: (sent) => (sent.subflowKey === "find_titles" ? SCRIPTS.uninput : sent.subflowKey === "find_and_hold" ? SCRIPTS.routed : undefined) });
    const run = await supervise([
      call(IDS.writePlan, SPLIT),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...planInput([subflow("find_and_hold", ["p1", "p2"])], SPEC), reason: "One subflow finds the titles and places the hold." }),
      call(IDS.assemble),
      dispatch([brief("find_and_hold", ["p1", "p2"])]),
      call(IDS.assemble),
      test,
      complete
    ], built);
    const proposal = built.proposals.get("brief-1")!;
    const amended = amendOf(run);
    expect(amended).toMatchObject({
      ok: true, proposalsKept: [], proposalsDropped: [],
      proposalsCarried: [{ subflowKey: "find_and_hold", briefId: "brief-1", revision: proposal.revision, addedParts: ["p2"], removedOutputs: ["titles"], absorbed: { builtFor: "find_titles", partsFrom: ["place_hold"], routerRun: true } }]
    });
    expect(String((amended.proposalsCarried as JsonObject[])[0]!.because)).toContain("the subflow the router runs");
    expect(answersOf(run.shown, IDS.assemble)[0]).toMatchObject({ ok: false });
    expect(run.dispatched[1]!.briefs[0]!.carriedFrom).toEqual({ briefId: "brief-1", revision: proposal.revision, digest: proposal.digest, addedParts: ["p2"], renamedOutputs: [], removedOutputs: ["titles"], builtFor: "find_titles", routerRun: true });
    expect(answersOf(run.shown, IDS.assemble)[1]).toMatchObject({ ok: true, assembledFrom: [{ subflowKey: "find_and_hold", briefId: "brief-2" }] });
    expect(run.outcome.status).toBe("candidate");
  });

  it("carries a proposal under its own key when another subflow's parts were merged into it, as on the Lab run", async () => {
    const run = await supervise([
      call(IDS.writePlan, SPLIT),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...planInput([subflow("find_titles", ["p1", "p2"])], SPEC), reason: "The hold is placed on the same page." }),
      end("blocked")
    ], project({ script: (sent, attempt) => (sent.subflowKey === "find_titles" && attempt === 1 ? SCRIPTS.uninput : undefined) }));
    expect(amendOf(run)).toMatchObject({
      ok: true, proposalsDropped: [],
      proposalsCarried: [{ subflowKey: "find_titles", briefId: "brief-1", why: ["its role changed", "its inputs or outputs changed", "its parts changed"], addedParts: ["p2"], absorbed: { builtFor: "find_titles", partsFrom: ["place_hold"], routerRun: true } }]
    });
  });

  it("carries one proposal when two were merged into one subflow, dropping the other with which was carried", async () => {
    const run = await supervise([
      call(IDS.writePlan, planInput([subflow("find_titles", ["p1"]), subflow("note_shelf", ["p3"], { after: ["find_titles"] })], SPEC13)),
      dispatch([brief("find_titles", ["p1"]), brief("note_shelf", ["p3"], ["find_titles"])]),
      call(IDS.amendPlan, { ...planInput([subflow("find_and_note", ["p1", "p3"])], SPEC13), reason: "One subflow does both." }),
      end("blocked")
    ], project({ script: (sent) => (sent.subflowKey === "find_titles" ? SCRIPTS.find : sent.subflowKey === "note_shelf" ? SCRIPTS.note : undefined) }));
    expect(amendOf(run)).toMatchObject({
      proposalsCarried: [{ subflowKey: "find_and_note", briefId: "brief-1", absorbed: { builtFor: "find_titles", partsFrom: ["note_shelf"] } }],
      proposalsDropped: [{ subflowKey: "note_shelf", why: ["it is no longer in the plan", "its parts are now in \"find_and_note\", whose next build brief starts from the proposal built for \"find_titles\" instead"] }]
    });
  });

  it("still drops a merged proposal whose inputs the merged subflow does not take, or whose lost output a subflow still takes", async () => {
    // find_titles took the author; the merged subflow, run by the router, takes nothing.
    const inputs = await supervise([
      call(IDS.writePlan, NARROWED),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...planInput([subflow("find_and_hold", ["p1", "p2"])], SPEC), reason: "One subflow does both." }),
      end("blocked")
    ]);
    expect(amendOf(inputs)).not.toHaveProperty("proposalsCarried");
    expect(amendOf(inputs)).toMatchObject({ proposalsDropped: [{ subflowKey: "find_titles", why: ["it is no longer in the plan"] }] });
    // The titles find_titles handed on are still taken, by a subflow the merge left.
    const taken = await supervise([
      call(IDS.writePlan, SPLIT),
      dispatch([brief("find_titles", ["p1"])]),
      call(IDS.amendPlan, { ...planInput([subflow("find_and_hold", ["p1", "p2"]), subflow("note_shelf", ["p3"], { inputs: ["titles"], after: ["find_and_hold"] })], SPEC3), reason: "Find and hold together." }),
      end("blocked")
    ], project({ script: (sent) => (sent.subflowKey === "find_titles" ? SCRIPTS.uninput : undefined) }));
    expect(amendOf(taken)).not.toHaveProperty("proposalsCarried");
    expect(amendOf(taken)).toMatchObject({ proposalsDropped: [{ subflowKey: "find_titles", why: ["it is no longer in the plan"] }] });
  });
});
