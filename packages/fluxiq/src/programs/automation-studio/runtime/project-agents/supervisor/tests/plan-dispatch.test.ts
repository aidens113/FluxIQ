// The planning format through the supervisor's loop on a stub provider
// (`./supervisor-script.ts`, t569): a one-part and a three-part task are
// planned in it, the structure plan Core compiles is recorded, and briefs that
// name no entry are dispatched with the plan's `after` as their predecessors,
// assembled and tested to a yes.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, HOLD, NOTE, call, complete, dispatch, end, lastOf, reset, supervise, test } from "./supervisor-script.ts";

/** A build brief with no entry: Core fills in the observed current page and the plan's `after`. */
const build = (subflowKey: string, parts: string[], extra: JsonObject = {}): JsonObject => ({ kind: "build", subflowKey, parts, allowanceUsd: 0.05, maxIterations: 20, ...extra });

// t630: every warning code but the constraint one was answered with the unused value's words, so a plan warned that a
// subflow only reshapes another's rows would have been told to remove the Flow's answer.
describe("a written plan's warnings", () => {
  it("each say what to do in their own code's words", async () => {
    const plan = planInput([
      subflow("find_titles", ["p1"], { outputs: ["titles", "branch"] }),
      subflow("shape_titles", ["p3"], { inputs: ["titles"], outputs: ["rows"], after: ["find_titles"] }),
      subflow("note_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
    ], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []], ["p3", NOTE, []]]));
    const run = await supervise([call(IDS.writePlan, plan), end("blocked")]);
    const warnings = lastOf(run.seen, IDS.writePlan)!.warnings as JsonObject[];
    const words: Readonly<Record<string, string>> = GUIDANCE.planIssues;
    expect(warnings.map((warning) => [warning.code, warning.path])).toEqual([
      ["project.plan_value_unused", "subflows.0.outputs.1"], ["project.plan_subflow_reshape_only", "subflows.1"], ["project.plan_subflow_constraint", "subflows.2"]
    ]);
    for (const warning of warnings) expect(warning.instruction, String(warning.code)).toBe(words[String(warning.code)]);
    expect(new Set(warnings.map((warning) => warning.instruction)).size).toBe(3);
  });
});

describe("the supervisor plans in its planning format", () => {
  it("one part: one router-run subflow, a brief with no entry, assembled, tested and completed", async () => {
    const plan = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
    const run = await supervise([call(IDS.writePlan, plan), dispatch([build("find_newest", ["p1"])]), call(IDS.assemble), test, complete]);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    const written = lastOf(run.seen, IDS.writePlan)!;
    expect(written).toMatchObject({ ok: true, routerRuns: "find_newest", subflows: [{ key: "find_newest", callable: false, parts: ["p1"] }] });
    const recorded = run.view!.record.plans.at(-1)!.plan;
    expect(recorded.plan.subflows.map((entry) => entry.key)).toEqual(["find_newest"]);
    expect(run.dispatched[0]!.briefs[0]!.entry).toEqual({ caseId: "observed-current", predecessors: [] });
    expect(run.outcome.candidate?.buildPlan.plan.subflows.map((entry) => entry.key)).toEqual(["find_newest"]);
  });

  it("three parts: callable parts Core keys under its router-run main, briefed in the plan's after order with no entry named", async () => {
    const plan = planInput([
      subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"], after: ["find_titles"] }),
      subflow("note_shelf", ["p3"], { inputs: ["shelf"], after: ["place_hold"] })
    ], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]], ["p3", NOTE, []]]));
    const run = await supervise([
      call(IDS.writePlan, plan),
      dispatch([build("note_shelf", ["p3"]), build("place_hold", ["p2"]), build("find_titles", ["p1"])]),
      call(IDS.assemble),
      // place_hold's part asks for a lasting act, which Core permits it (t570): its act is undone before the whole test.
      dispatch([reset()], "Put the target back before the whole test."),
      test,
      complete
    ]);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    // Core's own router-run subflow is named, not listed among the model's, so nothing invites copying it back (t595).
    const written = lastOf(run.seen, IDS.writePlan)!;
    expect(written.routerAddedByCore).toBe(GUIDANCE.router.addedByCore);
    expect((written.subflows as JsonObject[]).map((entry) => entry.key)).toEqual(["find_titles", "place_hold", "note_shelf"]);
    expect(written).toMatchObject({
      ok: true,
      routerRuns: "main",
      subflows: [
        { key: "find_titles", callable: true, inputs: ["author"], outputs: ["titles"], parts: ["p1"] },
        { key: "place_hold", callable: true, inputs: ["titles"], outputs: ["shelf"], parts: ["p2"], after: ["find_titles"] },
        { key: "note_shelf", callable: true, inputs: ["shelf"], outputs: [], parts: ["p3"], after: ["place_hold"] }
      ]
    });
    const sent = run.dispatched[0]!.briefs;
    expect(sent.map((entry) => [entry.subflowKey, entry.entry.predecessors])).toEqual([["find_titles", []], ["place_hold", ["find_titles"]], ["note_shelf", ["place_hold"]]]);
    // No brief wrote permittedActs: each was permitted exactly what its parts ask for (t570).
    expect(sent.map((entry) => [entry.subflowKey, entry.permittedActs])).toEqual([["find_titles", []], ["place_hold", ["create_new"]], ["note_shelf", []]]);
    expect(lastOf(run.seen, IDS.assemble)!.calls).toEqual({ subflowKey: "main", inOrder: ["find_titles", "place_hold", "note_shelf"] });
    const main = run.outcome.candidate!.buildPlan.plan.subflows.find((entry) => entry.key === "main")!;
    expect(main.nodes.map((node) => [node.parameters?.subflowId, node.parameters?.inputs])).toEqual([
      ["find_titles", { author: { $state: { path: "author" } } }],
      ["place_hold", { titles: { $state: { path: "$node.s1.titles" } } }],
      ["note_shelf", { shelf: { $state: { path: "$node.s2.shelf" } } }]
    ]);
  });

  it("refuses the raw bootstrap plan bigbox guessed at, by the planning format's own fields, and then takes the format", async () => {
    const raw = { taskSpec: taskSpecInput([["p1", FIND, []]]), structurePlan: { plan: { subflows: [{ key: "main", callable: false, nodes: [], edges: [] }] }, partOf: { main: ["p1"] } } };
    const run = await supervise([call(IDS.writePlan, raw), call(IDS.writePlan, planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]))), dispatch([build("main", ["p1"])]), call(IDS.assemble), test, complete]);
    const writes = run.shown.filter((entry) => entry.toolId === IDS.writePlan).map((entry) => entry.value as JsonObject);
    expect(writes[0]).toMatchObject({ ok: false, code: "project.plan_refused", issues: [{ code: "project.unknown_field", path: "structurePlan" }, { code: "project.missing_field", path: "subflows" }] });
    expect(writes[1]).toMatchObject({ ok: true });
    expect(run.outcome.status).toBe("candidate");
  });
});
