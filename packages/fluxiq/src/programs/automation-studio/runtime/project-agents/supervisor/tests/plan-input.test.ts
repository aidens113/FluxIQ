// The supervisor's planning format (`../plan-input.ts`, t569): what it writes
// -- subflows with their parts, the names they take and hand on, and what runs
// before each -- and the structure plan Core compiles from it. Bigbox
// `run-mv7t19hg-1d51f430` (steps 0025-0034) was refused five raw bootstrap plans
// in a row; here every refusal names the planning format's own path.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioProjectSupervisorPlanInput } from "../plan-input.ts";
import { SOURCES, planInput, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, HOLD, NOTE } from "./supervisor-script.ts";

const ONE = taskSpecInput([["p1", FIND, []]]);
const THREE = taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]], ["p3", NOTE, []]]);
const read = (value: JsonObject) => automationStudioProjectSupervisorPlanInput(value, SOURCES);

describe("the supervisor's planning format", () => {
  it("compiles a one-part task into the one subflow the router runs, carrying its part, with no success check", () => {
    const result = read(planInput([subflow("find_titles", ["p1"])], ONE));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.structure.plan).toEqual({
      schemaVersion: "0.1",
      router: { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "find_titles" } },
      subflows: [{ key: "find_titles", name: "find titles", role: "primary", nodes: [], edges: [] }]
    });
    expect(result.structure.partOf).toEqual({ find_titles: ["p1"] });
    expect(result.structure.taskSpecDigest).toBe(result.taskSpec.digest);
    expect(result.purposes).toEqual({ find_titles: "Does p1." });
    expect(result.after).toEqual({ find_titles: [] });
  });

  it("compiles a three-part task into callable parts with interfaces from their names, and adds the subflow the router runs", () => {
    const result = read(planInput([
      subflow("find_titles", ["p1"], { outputs: ["titles"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"], after: ["find_titles"] }),
      subflow("note_shelf", ["p3"], { inputs: ["shelf"], after: ["place_hold"] })
    ], THREE));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const plan = result.structure.plan;
    expect(plan.router.fallback).toEqual({ kind: "subflow", targetSubflowKey: "main" });
    expect(plan.subflows.map((entry) => [entry.key, entry.role, entry.interface ? "callable" : "router-run"])).toEqual([
      ["main", "primary", "router-run"], ["find_titles", "utility", "callable"], ["place_hold", "utility", "callable"], ["note_shelf", "utility", "callable"]
    ]);
    expect(plan.subflows[2]!.interface).toEqual({
      inputs: [{ id: "titles", name: "titles", valueType: { kind: "unknown" } }],
      outputs: [{ id: "shelf", name: "shelf", valueType: { kind: "unknown" } }]
    });
    expect(plan.subflows.every((entry) => entry.metadata === undefined)).toBe(true);
    expect(result.structure.partOf).toEqual({ main: [], find_titles: ["p1"], place_hold: ["p2"], note_shelf: ["p3"] });
    expect(result.after).toEqual({ find_titles: [], place_hold: ["find_titles"], note_shelf: ["place_hold"] });
    expect(Object.keys(result.purposes)).toEqual(["main", "find_titles", "place_hold", "note_shelf"]);
  });

  it("makes one subflow with an output callable too, and keys the router-run one around a part keyed main", () => {
    const result = read(planInput([subflow("main", ["p1"], { outputs: ["titles"] })], ONE));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.structure.plan.subflows.map((entry) => entry.key)).toEqual(["main_2", "main"]);
    expect(result.structure.plan.router.fallback).toEqual({ kind: "subflow", targetSubflowKey: "main_2" });
  });

  it.each([
    ["the raw plan's own field", { taskSpec: ONE, structurePlan: { plan: {}, partOf: {} } }, [{ code: "project.unknown_field", path: "structurePlan" }, { code: "project.missing_field", path: "subflows" }]],
    ["no subflow", planInput([], ONE), [{ code: "project.plan_no_subflows", path: "subflows" }]],
    ["a raw subflow's field", planInput([{ ...subflow("find_titles", ["p1"]), callable: true }], ONE), [{ code: "project.unknown_field", path: "subflows.0.callable" }]],
    ["a key the Flow cannot hold", planInput([subflow("Find titles", ["p1"])], ONE), [{ code: "project.plan_subflow_key", path: "subflows.0.key" }]],
    ["a subflow with no part", planInput([subflow("find_titles", [])], ONE), [{ code: "project.plan_subflow_no_parts", path: "subflows.0.parts" }]],
    ["a value name that is not one", planInput([subflow("find_titles", ["p1"], { outputs: ["the titles"] })], ONE), [{ code: "project.plan_port_name", path: "subflows.0.outputs.0" }]],
    ["an after naming no subflow", planInput([subflow("find_titles", ["p1"], { after: ["somewhere"] })], ONE), [{ code: "project.plan_after_unknown", path: "subflows.0.after.0" }]],
    ["a part the task spec does not have", planInput([subflow("find_titles", ["p1", "p9"])], ONE), [{ code: "project.plan_part_unknown", path: "subflows.0.parts.1" }]],
    ["a part no subflow carries", planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] })], THREE), [{ code: "project.plan_part_uncovered", path: "taskSpec.parts.1" }, { code: "project.plan_part_uncovered", path: "taskSpec.parts.2" }]],
    ["two subflows with one key", planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("find_titles", ["p2", "p3"], { inputs: ["titles"] })], THREE), [{ code: "project.duplicate_subflow", path: "subflows.1.key" }]],
    ["an after that makes a circle", planInput([subflow("find_titles", ["p1"], { outputs: ["titles"], after: ["place_hold"] }), subflow("place_hold", ["p2", "p3"], { inputs: ["titles"], after: ["find_titles"] })], THREE), [{ code: "project.plan_after_cycle", path: "subflows" }]]
  ])("refuses %s, by its path in what was sent", (_name, value, issues) => {
    const result = read(value as JsonObject);
    expect(result).toEqual({ ok: false, issues });
  });

  // Bigbox debug fix 7: warnings, never refusals -- Core cannot tell a value the Flow hands back from one nobody reads,
  // or a read the person asked for from a part that only says what must stay unchanged (`../plan-input.ts`).
  it("writes a plan whose every value is taken and every subflow acts or hands on, with no warning", () => {
    const result = read(planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]])));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([]);
  });

  it("warns on a value no other subflow takes, by its path, and still writes the plan", () => {
    const result = read(planInput([
      subflow("find_titles", ["p1"], { outputs: ["titles", "branch"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })
    ], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]])));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([{ code: "project.plan_value_unused", path: "subflows.0.outputs.1" }]);
    expect(result.structure.plan.subflows.find((entry) => entry.key === "find_titles")!.interface!.outputs.map((port) => port.id)).toEqual(["titles", "branch"]);
  });

  it("warns on a subflow of several that neither makes a lasting act nor hands anything on, as a constraint it may be", () => {
    const result = read(planInput([
      subflow("find_titles", ["p1"], { outputs: ["titles"] }),
      subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] }),
      subflow("keep_others", ["p3"], { inputs: ["titles"], after: ["place_hold"] })
    ], THREE));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([{ code: "project.plan_subflow_constraint", path: "subflows.2" }]);
  });

  it("never warns a one-subflow plan as a constraint", () => {
    const result = read(planInput([subflow("find_titles", ["p1"])], ONE));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([]);
  });

  it("answers every subflow's issue and the task spec's together", () => {
    const value = planInput([subflow("find_titles", ["p1"], { outputs: ["the titles"] }), subflow("Place", ["p2"])], taskSpecInput([["p1", "Find every title ever written", []], ["p2", HOLD, []]]));
    expect(read(value)).toEqual({ ok: false, issues: [
      { code: "project.quote_not_verbatim", path: "taskSpec.parts.0.quote.text" },
      { code: "project.plan_port_name", path: "subflows.0.outputs.0" },
      { code: "project.plan_subflow_key", path: "subflows.1.key" }
    ] });
  });

  // Bigbox `run-mv8c7unr-42a8456d` copied Core's router-run subflow back with `parts: []` and was refused (t595).
  it("leaves out Core's own router subflow sent back with no parts, compiling the plan the model meant, every path still the one sent", () => {
    const written = [subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"], after: ["find_titles"] }), subflow("note_shelf", ["p3"], { inputs: ["shelf"], after: ["place_hold"] })];
    const meant = read(planInput(written, THREE));
    const copied = read(planInput([{ key: "main", name: "Main", parts: [], inputs: [], outputs: [] }, ...written.map((entry) => ({ ...entry, after: [...((entry.after as string[] | undefined) ?? []), "main"] }))], THREE));
    if (!meant.ok || !copied.ok) throw new Error(JSON.stringify([meant, copied]));
    expect(copied.structure.digest).toBe(meant.structure.digest);
    expect(copied.after).toEqual(meant.after);
    // An issue in a later subflow names its own index in what was sent.
    const refused = read(planInput([{ key: "main", name: "Main", parts: [] }, subflow("find_titles", ["p1"], { outputs: ["the titles"] }), ...written.slice(1)], THREE));
    expect(refused).toEqual({ ok: false, issues: [{ code: "project.plan_port_name", path: "subflows.1.outputs.0" }] });
    // Any other subflow with no parts is still refused, and so is the router key alone.
    expect(read(planInput([{ key: "extra", name: "Extra", parts: [] }, ...written], THREE))).toEqual({ ok: false, issues: [{ code: "project.plan_subflow_no_parts", path: "subflows.0.parts" }] });
    expect(read(planInput([{ key: "main", name: "Main", parts: [] }], ONE))).toEqual({ ok: false, issues: [{ code: "project.plan_subflow_no_parts", path: "subflows.0.parts" }] });
  });
});
