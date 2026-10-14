import { describe, expect, it } from "vitest";
import { automationStudioProjectStructurePlan } from "../index.ts";
import { structurePlan, taskSpec } from "../../tests/fixtures.ts";

const parse = automationStudioProjectStructurePlan.parse;
const issues = automationStudioProjectStructurePlan.issues;

describe("structure plan", () => {
  it("parses a good plan unchanged and finds nothing wrong with it", () => {
    expect(parse(structurePlan())).toEqual({ status: "valid", value: structurePlan() });
    expect(issues(structurePlan(), taskSpec())).toEqual([]);
  });

  it.each([
    ["a non-empty body", (plan: ReturnType<typeof structurePlan>) => plan.plan.subflows[0]!.nodes.push({ key: "n", definitionId: "x", definitionVersion: "1" }), "project.plan_body_not_empty"],
    ["a router rule naming no subflow", (plan: ReturnType<typeof structurePlan>) => (plan.plan.router.rules[0]!.targetSubflowKey = "nowhere"), "project.plan_unknown_subflow"],
    ["a fallback naming no subflow", (plan: ReturnType<typeof structurePlan>) => (plan.plan.router.fallback = { kind: "subflow", targetSubflowKey: "nowhere" }), "project.plan_unknown_subflow"],
    ["duplicate subflow keys", (plan: ReturnType<typeof structurePlan>) => (plan.plan.subflows[1]!.key = "list_soups"), "project.duplicate_subflow"],
    ["no success check", (plan: ReturnType<typeof structurePlan>) => (plan.plan.subflows[0]!.metadata = { "fluxiq.successCheck": [] }), "project.plan_success_check_missing"],
    ["a subflow missing from partOf", (plan: ReturnType<typeof structurePlan>) => delete plan.partOf.save_recipe, "project.missing_field"],
    ["a partOf key that is not a subflow", (plan: ReturnType<typeof structurePlan>) => (plan.partOf.ghost = ["p1"]), "project.unknown_field"],
    ["a malformed interface port", (plan: ReturnType<typeof structurePlan>) => (plan.plan.subflows[1]!.interface!.inputs[0]!.valueType = { kind: "text" } as unknown as { kind: "unknown" }), "project.invalid_choice"]
  ])("refuses %s", (_name, change, code) => {
    const plan = structuredClone(structurePlan());
    change(plan);
    expect(parse(plan)).toMatchObject({ status: "invalid", code });
  });

  it("refuses a forged digest and changes its digest with partOf or the task spec it binds", () => {
    const forged = structurePlan();
    forged.partOf.list_soups = ["p1", "p2"];
    expect(parse(forged)).toMatchObject({ status: "invalid", code: "project.plan_digest_mismatch" });
    expect(structurePlan((plan) => (plan.partOf.list_soups = ["p1", "p2"])).digest).not.toBe(structurePlan().digest);
    expect(structurePlan(undefined, taskSpec((spec) => (spec.notAsked = []))).digest).not.toBe(structurePlan().digest);
  });

  it("refuses a plan that leaves a part uncovered, names an unknown part, or binds another task spec", () => {
    expect(issues(structurePlan((plan) => (plan.partOf.save_recipe = [])), taskSpec())).toEqual([{ code: "project.plan_part_uncovered", path: "taskSpec.parts.1" }]);
    expect(issues(structurePlan((plan) => (plan.partOf.save_recipe = ["p2", "p9"])), taskSpec())).toEqual([{ code: "project.plan_part_unknown", path: "structurePlan.partOf.save_recipe.1" }]);
    expect(issues(structurePlan(), taskSpec((spec) => (spec.notAsked = [])))).toEqual([{ code: "project.plan_task_spec_stale", path: "structurePlan.taskSpecDigest" }]);
  });

  it("applies the router's own checks, leaving a part's reachability to its future callers", () => {
    const unreachable = structurePlan((plan) => plan.plan.subflows.push({ key: "orphan", name: "Orphan", role: "primary", nodes: [], edges: [], metadata: { "fluxiq.successCheck": [{ fact: "x", op: "exists" }] } }));
    expect(issues(unreachable, taskSpec())).toEqual([{ code: "bootstrap.subflow_unreachable", path: "structurePlan.plan.subflows.2" }]);
    const noCondition = structurePlan((plan) => delete plan.plan.router.rules[0]!.condition);
    expect(issues(noCondition, taskSpec()).map((issue) => issue.code)).toContain("bootstrap.route_condition_missing");
  });
});
