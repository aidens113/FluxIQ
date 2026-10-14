import { describe, expect, it } from "vitest";
import { automationStudioProjectAskedActs, automationStudioProjectSubflowBrief } from "../index.ts";
import { brief, structurePlan, taskSpec } from "../../tests/fixtures.ts";

const parse = automationStudioProjectSubflowBrief.parse;
const issues = automationStudioProjectSubflowBrief.issues;

describe("subflow brief", () => {
  it("parses a good brief unchanged and binds it to its plan", () => {
    expect(parse(brief())).toEqual({ status: "valid", value: brief() });
    expect(issues(brief(), structurePlan(), taskSpec())).toEqual([]);
  });

  it.each([
    ["a brief id that is not a file name", (value: ReturnType<typeof brief>) => (value.briefId = "B 1"), "project.invalid_storage_id"],
    ["an unknown kind", (value: ReturnType<typeof brief>) => (value.kind = "explore" as "build"), "project.invalid_choice"],
    ["a build with no parts", (value: ReturnType<typeof brief>) => (value.parts = []), "project.brief_no_parts"],
    ["a repair with no failing receipt", (value: ReturnType<typeof brief>) => (value.kind = "repair"), "project.brief_failing_receipt"],
    ["a failing receipt outside a repair", (value: ReturnType<typeof brief>) => (value.failingReceipt = { kind: "subflow_trial", receiptId: "r", digest: "c".repeat(64) }), "project.brief_failing_receipt"],
    ["no allowance", (value: ReturnType<typeof brief>) => (value.allowanceUsd = 0), "project.invalid_amount"],
    ["a malformed plan digest", (value: ReturnType<typeof brief>) => (value.planDigest = "not-a-digest"), "project.invalid_digest"],
    ["a supervisor handle", (value: ReturnType<typeof brief>) => Object.assign(value, { packetHandle: "packet.1" }), "project.unknown_field"]
  ])("refuses %s", (_name, change, code) => {
    const value = brief();
    change(value);
    expect(parse(value)).toMatchObject({ status: "invalid", code });
  });

  it("refuses more turns than a builder's loop takes (t577)", () => {
    expect(parse(brief((value) => (value.maxIterations = 64)))).toMatchObject({ status: "valid" });
    expect(parse(brief((value) => (value.maxIterations = 65)))).toMatchObject({ status: "invalid", code: "project.invalid_count", path: "brief.maxIterations" });
  });

  it("carries Core's call share when it has one, and refuses a share that is no count (t570)", () => {
    expect(parse(brief((value) => (value.maxCalls = 11)))).toEqual({ status: "valid", value: brief((value) => (value.maxCalls = 11)) });
    expect(parse(brief((value) => (value.maxCalls = 0)))).toMatchObject({ status: "invalid", path: "brief.maxCalls" });
    expect(parse(brief((value) => (value.maxCalls = 2.5)))).toMatchObject({ status: "invalid", path: "brief.maxCalls" });
  });

  it("permits a brief whose parts act every act the task asks for, and one whose parts only read none (t575)", () => {
    const spec = taskSpec((value) => value.parts.push({ id: "p3", quote: { sourceId: "instruction.1", text: "rename the cookbook" }, goalFacts: ["the cookbook has its new name"], lastingActs: ["modify_existing"] }));
    expect(automationStudioProjectAskedActs(spec, ["p2"])).toEqual(["create_new", "modify_existing"]);
    expect(automationStudioProjectAskedActs(spec, ["p1"])).toEqual([]);
    const plan = structurePlan(undefined, spec);
    // The supervisor filed saving as `create_new`; a builder that reads its press as changing the cookbook is not refused for the label.
    expect(issues(brief((value) => (value.permittedActs = ["create_new", "modify_existing"]), plan), plan, spec)).toEqual([]);
    expect(issues(brief((value) => (value.permittedActs = ["move_money"]), plan), plan, spec).map((issue) => issue.code)).toEqual(["project.brief_act_not_asked"]);
  });

  it("accepts a reset without parts or acts, and refuses one that names parts", () => {
    expect(parse(brief((value) => Object.assign(value, { kind: "reset", parts: [], permittedActs: [] })))).toMatchObject({ status: "valid" });
    expect(parse(brief((value) => Object.assign(value, { kind: "reset" })))).toMatchObject({ status: "invalid", code: "project.brief_reset_parts" });
  });

  it("accepts a repair that names its failing receipt and a survey without parts", () => {
    expect(parse(brief((value) => Object.assign(value, { kind: "repair", failingReceipt: { kind: "subflow_trial", receiptId: "r", digest: "c".repeat(64) } })))).toMatchObject({ status: "valid" });
    expect(parse(brief((value) => Object.assign(value, { kind: "survey", parts: [], permittedActs: [] })))).toMatchObject({ status: "valid" });
  });

  it("refuses a brief written against another plan", () => {
    const replanned = structurePlan((plan) => (plan.partOf.list_soups = ["p1", "p2"]));
    expect(issues(brief(), replanned, taskSpec())).toEqual([{ code: "project.brief_plan_stale", path: "brief.planDigest" }]);
  });

  it("refuses parts, interface, predecessors and acts the plan does not give it", () => {
    const codes = (change: (value: ReturnType<typeof brief>) => void) => issues(brief(change), structurePlan(), taskSpec()).map((issue) => issue.code);
    expect(codes((value) => (value.parts = ["p1", "p2"]))).toEqual(["project.brief_part_not_carried"]);
    expect(codes((value) => (value.subflowKey = "ghost"))).toEqual(["project.brief_subflow_unknown"]);
    expect(codes((value) => delete value.interface)).toEqual(["project.brief_interface_mismatch"]);
    expect(codes((value) => (value.entry.predecessors = ["save_recipe", "ghost"]))).toEqual(["project.brief_predecessor_invalid", "project.brief_predecessor_invalid"]);
    expect(codes((value) => (value.permittedActs = ["create_new", "move_money"]))).toEqual(["project.brief_act_not_asked"]);
  });
});
