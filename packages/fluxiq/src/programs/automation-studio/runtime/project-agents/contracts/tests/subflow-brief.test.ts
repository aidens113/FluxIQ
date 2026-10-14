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

  // Bigbox `run-mv8c7unr-42a8456d`: a repair's receipt was stored and shown to no builder (t595).
  it("carries a repair's failing trial as Core read it, and refuses one outside a repair, one that passed or one past its bound", () => {
    const failingTrial = { verdict: "execution_failed", failedStep: { step: 2, label: "save it", failureCode: "web.target.not_found" }, said: { code: "candidate.trial_execution_failed" } };
    const repair = (trial: unknown) => brief((value) => Object.assign(value, { kind: "repair", failingReceipt: { kind: "candidate_trial", receiptId: "run-1", digest: "c".repeat(64) }, failingTrial: trial }));
    expect(parse(repair(failingTrial))).toEqual({ status: "valid", value: repair(failingTrial) });
    expect(parse(brief((value) => Object.assign(value, { failingTrial })))).toMatchObject({ status: "invalid", code: "project.brief_failing_receipt", path: "brief.failingTrial" });
    expect(parse(repair({ ...failingTrial, verdict: "yes" }))).toMatchObject({ status: "invalid", code: "project.invalid_choice", path: "brief.failingTrial.verdict" });
    expect(parse(repair({ ...failingTrial, said: { text: "x".repeat(9000) } }))).toMatchObject({ status: "invalid", code: "project.too_long", path: "brief.failingTrial.said" });
  });

  it("reads a trial that did not pass into its failing step and the rest of what it said, bounded, and a trial that passed into none", () => {
    const steps = [{ step: 1, status: "succeeded", definitionId: "web.browser.navigate" }, { step: 2, status: "failed", definitionId: "web.dom.click", label: "save it", failureCode: "web.target.not_found" }];
    expect(automationStudioProjectSubflowBrief.failingTrial({ verdict: "execution_failed", feedback: { code: "candidate.trial_execution_failed", steps } }))
      .toEqual({ verdict: "execution_failed", failedStep: steps[1], said: { code: "candidate.trial_execution_failed" } });
    expect(automationStudioProjectSubflowBrief.failingTrial({ verdict: "no", feedback: { reasons: "The cookbook was not saved." } })).toEqual({ verdict: "no", said: { reasons: "The cookbook was not saved." } });
    expect(automationStudioProjectSubflowBrief.failingTrial({ verdict: "yes", feedback: {} })).toBeUndefined();
    // Past its bound, only its plain fields are kept, each text cut short.
    const long = automationStudioProjectSubflowBrief.failingTrial({ verdict: "no", feedback: { code: "c.d_e", reading: { rows: "x".repeat(9000) }, note: "y".repeat(900) } })!;
    expect(long.said).toEqual({ code: "c.d_e", note: `${"y".repeat(497)}...` });
  });

  // Social `run-mv8mebid-84ada5bd`: a whole test passed only on the run's own recovery, and its repair was refused (t603).
  it("carries a pass the run rescued as a failing trial only with its interruptions, and refuses them anywhere else", () => {
    const rescued = { verdict: "yes", interruptions: [{ step: 3, label: "save it", needs: { paceAtLeastMs: 2000 } }], said: { judge: "yes" } };
    const repair = (trial: unknown) => brief((value) => Object.assign(value, { kind: "repair", failingReceipt: { kind: "candidate_trial", receiptId: "run-1", digest: "c".repeat(64) }, failingTrial: trial }));
    expect(parse(repair(rescued))).toEqual({ status: "valid", value: repair(rescued) });
    expect(parse(repair({ ...rescued, interruptions: [] }))).toMatchObject({ status: "invalid", code: "project.brief_failing_receipt", path: "brief.failingTrial.interruptions" });
    expect(parse(repair({ ...rescued, verdict: "no" }))).toMatchObject({ status: "invalid", code: "project.brief_failing_receipt", path: "brief.failingTrial.interruptions" });
    expect(parse(repair({ ...rescued, failedStep: { step: 3 } }))).toMatchObject({ status: "invalid", code: "project.brief_failing_receipt", path: "brief.failingTrial.interruptions" });
    expect(parse(repair({ ...rescued, interruptions: [{ text: "x".repeat(4000) }] }))).toMatchObject({ status: "invalid", code: "project.too_long", path: "brief.failingTrial.interruptions.0" });
  });

  it("reads a pass the gate holds back into each step the run recovered at, as its step record has it, and a pass with nothing held back into none", () => {
    const recovered = { step: 2, definitionId: "web.dom.click", label: "save it", control: "Save", status: "succeeded", absorbed: [{ failureCode: "web.action.rate_limited", askedWaitMs: 3000 }], interruptions: [{ kind: "rate_limit", wayOut: "t9" }] };
    const feedback = { judge: "yes", steps: [{ step: 1, status: "succeeded", definitionId: "web.browser.navigate" }, recovered], paces: [{ definitionId: "web.dom.click", label: "save it", control: "Save", paceMs: 3200 }] };
    const unanswered = [{ step: 2, label: "save it", paceAtLeastMs: 3200, wayOut: "t9", waitAtLeastMs: 3000 }];
    expect(automationStudioProjectSubflowBrief.failingTrial({ verdict: "yes", feedback }, unanswered)).toEqual({
      verdict: "yes",
      interruptions: [{ step: 2, label: "save it", definitionId: "web.dom.click", control: "Save", absorbed: recovered.absorbed, interruptions: recovered.interruptions, learned: feedback.paces, needs: { paceAtLeastMs: 3200, wayOut: "t9", waitAtLeastMs: 3000 } }],
      said: { judge: "yes", paces: feedback.paces }
    });
    expect(automationStudioProjectSubflowBrief.failingTrial({ verdict: "yes", feedback }, [])).toBeUndefined();
    expect(automationStudioProjectSubflowBrief.failingTrial({ verdict: "yes", feedback })).toBeUndefined();
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
