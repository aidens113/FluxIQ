// A failed test is repaired on its failing step and checked from there; the
// part is tested whole again only after that (t804; Core's rule "build the whole
// Flow first; test it whole only when it should work"). E's builder re-tested its
// whole part from the start after every one-step change. The gate now runs the
// latest proposal from a step (`from`), never as the part's test, and refuses a
// whole test while a failed test's repair is unchecked (`./pending-repair.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapNode } from "../../../../plan/index.ts";
import {
  AutomationStudioSubflowPendingRepair,
  AutomationStudioSubflowTrialGate,
  type AutomationStudioSubflowFromStepRequest,
  type AutomationStudioSubflowFromStepResult,
  type AutomationStudioSubflowProposal,
  type AutomationStudioSubflowTrialPreparingPort,
  type AutomationStudioSubflowTrialRequest,
  type AutomationStudioSubflowTrialResult
} from "../../../index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../../../candidate/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../../../site-reset/index.ts";
import { testScope } from "../../subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };

function node(key: string, url = "https://listings.test/all"): AutomationStudioFlowBootstrapNode {
  return { key, definitionId: "web.browser.navigate", definitionVersion: "1", label: `step ${key}`, parameters: { url } };
}
function proposal(revision: number, nodes: AutomationStudioFlowBootstrapNode[], digest = String(revision).repeat(64).slice(0, 64)): AutomationStudioSubflowProposal {
  return { scope: identity, revision, digest, subflows: [{ key: scope.subflowKey, name: "Find", role: "primary", nodes, edges: [] }], summary: "Find", changedPaths: [] };
}
const STEPS = [node("s1"), node("s2"), node("s3")];
const receipt = (of: AutomationStudioSubflowProposal): JsonObject => ({ revision: of.revision, digest: of.digest });

type Trial = { verdict: AutomationStudioCandidateTrialVerdict; stoppedAtKey?: string; entryPrepared?: boolean; feedback?: JsonObject };
type FromStep = Partial<Pick<AutomationStudioSubflowFromStepResult, "status" | "passedKeys" | "stoppedAtKey" | "acts">> & { briefId?: string };

/** A gate over `latest`, whose port answers each whole test with the next of `trials` and each from-step run with `fromStep`. */
function gateOver(state: { latest: AutomationStudioSubflowProposal }, trials: Trial[], options: { fromStep?: false; memory?: AutomationStudioSubflowPendingRepair; scope?: typeof scope; whole?: true; fromStepAnswer?: (request: AutomationStudioSubflowFromStepRequest) => FromStep; trialRan?: (acts: readonly unknown[]) => void } = {}) {
  const asked: AutomationStudioSubflowTrialRequest[] = [];
  const ran: AutomationStudioSubflowFromStepRequest[] = [];
  const port = (async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    asked.push(request);
    const trial = trials.shift() ?? { verdict: "yes" };
    const feedback = trial.feedback ?? (trial.verdict === "execution_failed" ? { code: "candidate.execution_incomplete", steps: [{ step: 2, label: "step s2", status: "failed", failureCode: "web.target.not_found", retryable: true }] } : {});
    return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: trial.verdict, feedback, entryPrepared: trial.entryPrepared ?? true, ...(trial.stoppedAtKey ? { stoppedAtKey: trial.stoppedAtKey } : {}) };
  }) as AutomationStudioSubflowTrialPreparingPort & { fromStep?: unknown };
  if (options.fromStep !== false) {
    Object.assign(port, { fromStep: async (request: AutomationStudioSubflowFromStepRequest): Promise<AutomationStudioSubflowFromStepResult> => {
      ran.push(request);
      const said = options.fromStepAnswer?.(request) ?? {};
      return { fromStep: true, identity: { ...request.proposal.scope, ...(said.briefId ? { briefId: said.briefId } : {}) }, revision: request.proposal.revision, digest: request.proposal.digest, fromKey: request.fromKey, status: said.status ?? "ended", passedKeys: said.passedKeys ?? [request.fromKey], feedback: { ran: true }, ...(said.stoppedAtKey ? { stoppedAtKey: said.stoppedAtKey } : {}), ...(said.acts ? { acts: said.acts } : {}) };
    } });
  }
  const reset: AutomationStudioSiteResetTrialReset | undefined = options.trialRan ? { beforeTrial: async () => { throw new Error("no whole test runs here"); }, trialRan: (acts) => {
    options.trialRan!(acts);
    return [];
  } } : undefined;
  const gate = new AutomationStudioSubflowTrialGate({ scope: options.scope ?? scope, latest: () => structuredClone(state.latest), port, ...(options.whole ? { whole: true as const } : {}), ...(options.memory ? { pendingRepair: options.memory } : {}), ...(reset ? { reset } : {}) });
  return { gate, asked, ran };
}

describe("a run from a step (t804)", () => {
  it("runs only the port's from-step run, is never the part's test, and records its acts", async () => {
    const state = { latest: proposal(1, STEPS) };
    const recorded: unknown[][] = [];
    const act = { act: "act-1", did: "pressed", node: "s2" } as unknown as NonNullable<FromStep["acts"]>[number];
    const { gate, asked, ran } = gateOver(state, [], { fromStepAnswer: () => ({ acts: [act] }), trialRan: (acts) => recorded.push([...acts]) });
    const answer = await gate.test({ ...receipt(state.latest), from: "s2" });
    expect(asked).toHaveLength(0);
    expect(ran).toHaveLength(1);
    expect(ran[0]).toMatchObject({ fromKey: "s2", proposal: { revision: 1 } });
    expect(answer.evidence).toMatchObject({ ok: true, fromStep: true, passed: true, from: "s2", passedKeys: ["s2"], steps: { ran: true } });
    expect((answer.evidence as JsonObject).partial).toBeUndefined();
    expect(String((answer.evidence as JsonObject).instruction)).toContain("This run is not the part's test");
    expect(recorded).toEqual([[act]]);
    // Never counted, never kept, never accepted by completion (rule 4).
    expect(gate.standing(state.latest)).toBeUndefined();
    expect(gate.completion(state.latest)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_required"] });
  });

  it("refuses a step the latest proposal does not have, and a port's answer about another run", async () => {
    const state = { latest: proposal(1, STEPS) };
    const { gate } = gateOver(state, []);
    expect((await gate.test({ ...receipt(state.latest), from: "s9" })).evidence).toMatchObject({ ok: false, code: "subflow.from_step_unknown", steps: ["s1", "s2", "s3"] });
    const lying = gateOver(state, [], { fromStepAnswer: () => ({ briefId: "another-brief" }) });
    expect((await lying.gate.test({ ...receipt(state.latest), from: "s2" })).evidence).toMatchObject({ ok: false, code: "subflow.from_step_result_invalid" });
    expect((await gate.test({ ...receipt(state.latest), from: "s2", cannotUndo: [] })).evidence).toMatchObject({ ok: false, code: "subflow.trial_input_invalid" });
  });

  it("does not apply where the port cannot run from a step", async () => {
    const state = { latest: proposal(1, STEPS) };
    const { gate, asked } = gateOver(state, [{ verdict: "execution_failed", stoppedAtKey: "s2" }, { verdict: "yes" }], { fromStep: false });
    expect(gate.tool.inputSchema.properties).not.toHaveProperty("from");
    expect(gate.tool.description).not.toContain("from the page the test left");
    const failed = (await gate.test(receipt(state.latest))).evidence as JsonObject;
    expect(String(failed.instruction)).not.toContain("Repair live");
    expect((await gate.test({ ...receipt(state.latest), from: "s2" })).evidence).toMatchObject({ ok: false, code: "subflow.from_step_unavailable" });
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ ok: true, verdict: "yes" });
    expect(asked).toHaveLength(2);
  });

  it("describes the tool within its bound and offers from where the port can run from a step", () => {
    for (const whole of [undefined, true as const]) {
      const { gate } = gateOver({ latest: proposal(1, STEPS) }, [], whole ? { whole } : {});
      expect(gate.tool.description.length).toBeLessThanOrEqual(2000);
      expect(gate.tool.description).toContain("repair it live: work on the failing step from the page the test left");
      expect(gate.tool.inputSchema.properties).toHaveProperty("from");
      expect(gate.tool.inputSchema.properties).toHaveProperty("fromStepImpossible");
    }
  });
});

describe("a failed whole test's repair (t804)", () => {
  it("refuses the whole test after a stop until a run from the failing step passes it, and says so in the failed test's instruction", async () => {
    const state = { latest: proposal(1, STEPS) };
    const { gate, asked } = gateOver(state, [{ verdict: "execution_failed", stoppedAtKey: "s2" }, { verdict: "yes" }],
      { fromStepAnswer: (request) => (request.fromKey === "s3" ? { passedKeys: ["s3"] } : request.fromKey === "s1" ? { status: "stopped", stoppedAtKey: "s2", passedKeys: ["s1"] } : { passedKeys: ["s2", "s3"] }) });
    const failed = (await gate.test(receipt(state.latest))).evidence as JsonObject;
    expect(String(failed.instruction)).toContain("Repair live, from the page this test left: work on step \"s2\" (\"step s2\") there");
    expect(String(failed.instruction)).toContain("Test the whole part again only when you believe the whole part works");
    // The same revision again, and a new one, are both refused while the repair is unchecked.
    const refused = await gate.test(receipt(state.latest));
    expect(refused.evidence).toMatchObject({ ok: false, code: "subflow.trial_from_step_first", repairStep: "s2" });
    expect(String((refused.evidence as JsonObject).instruction)).toContain(`{"revision": 1, "digest": "${state.latest.digest}", "from": "s2"}`);
    expect(refused.resultReason).toBeUndefined();
    state.latest = proposal(2, [node("s1"), node("s2", "https://listings.test/new"), node("s3")]);
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ code: "subflow.trial_from_step_first", repairStep: "s2" });
    expect(gate.completion(state.latest)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_from_step_first"], feedback: { repairStep: "s2" } });
    // A run that starts after the step, or stops before passing it, does not check the repair.
    expect((await gate.test({ ...receipt(state.latest), from: "s3" })).evidence).toMatchObject({ fromStep: true, repairChecked: false, repairStep: "s2" });
    expect((await gate.test({ ...receipt(state.latest), from: "s1" })).evidence).toMatchObject({ fromStep: true, passed: false, stoppedAt: "s2", repairChecked: false });
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ code: "subflow.trial_from_step_first" });
    // A run from the step that passes it clears the repair; the whole test then runs.
    const checked = (await gate.test({ ...receipt(state.latest), from: "s2" })).evidence as JsonObject;
    expect(checked).toMatchObject({ fromStep: true, repairChecked: true, repairStep: "s2" });
    expect(String(checked.instruction)).toContain("so the whole part may be tested again");
    expect(asked).toHaveLength(1);
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ ok: true, verdict: "yes", revision: 2 });
    expect(gate.completion(state.latest)).toEqual({ ok: true });
  });

  it("after a no, names the first changed step, and a run of the judged revision itself checks nothing", async () => {
    const state = { latest: proposal(1, STEPS) };
    const { gate } = gateOver(state, [{ verdict: "no" }, { verdict: "yes" }], { fromStepAnswer: (request) => ({ passedKeys: STEPS.map((step) => step.key).slice(STEPS.findIndex((step) => step.key === request.fromKey)) }) });
    const judged = (await gate.test(receipt(state.latest))).evidence as JsonObject;
    expect(String(judged.instruction)).toContain("work on the first step you change there");
    // The judged revision: the unchanged refusal stands first, and a run from a step checks no repair.
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ code: "subflow.trial_unchanged_after_no" });
    expect((await gate.test({ ...receipt(state.latest), from: "s1" })).evidence).toMatchObject({ fromStep: true, repairChecked: false });
    state.latest = proposal(2, [node("s1"), node("s2"), node("s3", "https://listings.test/sorted")]);
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ code: "subflow.trial_from_step_first", repairStep: "s3" });
    // Starting before the changed step and passing it checks the repair.
    expect((await gate.test({ ...receipt(state.latest), from: "s2" })).evidence).toMatchObject({ repairChecked: true });
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ ok: true, verdict: "yes" });
  });

  it("names the first changed step for a stop the port could not name, once the repair is submitted", async () => {
    const state = { latest: proposal(1, STEPS) };
    const { gate } = gateOver(state, [{ verdict: "execution_failed" }, { verdict: "yes" }]);
    await gate.test(receipt(state.latest));
    state.latest = proposal(2, [node("s1"), node("s2", "https://listings.test/fixed"), node("s3")]);
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ code: "subflow.trial_from_step_first", repairStep: "s2" });
    expect((await gate.test({ ...receipt(state.latest), from: "s3" })).evidence).toMatchObject({ repairChecked: false });
    expect((await gate.test({ ...receipt(state.latest), from: "s2" })).evidence).toMatchObject({ repairChecked: true });
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ ok: true, verdict: "yes" });
  });

  it("with no step named, is cleared by a run from a step that reaches the part's end", async () => {
    const state = { latest: proposal(1, STEPS) };
    const { gate } = gateOver(state, [{ verdict: "execution_failed" }, { verdict: "yes" }], { fromStepAnswer: (request) => (request.fromKey === "s2" ? { status: "stopped", stoppedAtKey: "s3", passedKeys: ["s2"] } : { passedKeys: ["s3"] }) });
    await gate.test(receipt(state.latest));
    const refused = (await gate.test(receipt(state.latest))).evidence as JsonObject;
    expect(refused).toMatchObject({ code: "subflow.trial_from_step_first" });
    expect(refused.repairStep).toBeUndefined();
    expect((await gate.test({ ...receipt(state.latest), from: "s2" })).evidence).toMatchObject({ repairChecked: false });
    expect((await gate.test({ ...receipt(state.latest), from: "s3" })).evidence).toMatchObject({ repairChecked: true });
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ ok: true, verdict: "yes" });
  });

  it("allows the whole test while a repair stands where the builder says why a run from the step cannot check it, or the step is the part's first", async () => {
    const state = { latest: proposal(1, STEPS) };
    const { gate, asked } = gateOver(state, [{ verdict: "execution_failed", stoppedAtKey: "s2" }, { verdict: "execution_failed", stoppedAtKey: "s1" }, { verdict: "yes" }]);
    await gate.test(receipt(state.latest));
    expect((await gate.test({ ...receipt(state.latest), fromStepImpossible: "   " })).evidence).toMatchObject({ ok: false, code: "subflow.trial_input_invalid" });
    expect((await gate.test({ ...receipt(state.latest), fromStepImpossible: "" })).evidence).toMatchObject({ ok: false, code: "subflow.trial_input_invalid" });
    expect(asked).toHaveLength(1);
    // A reason lets it run; it then stops at the part's first step, whose whole test needs no reason.
    expect((await gate.test({ ...receipt(state.latest), fromStepImpossible: "The step reads a value only the part's start sets." })).evidence).toMatchObject({ verdict: "execution_failed" });
    expect((await gate.test(receipt(state.latest))).evidence).toMatchObject({ ok: true, verdict: "yes" });
    expect(asked).toHaveLength(3);
  });

  it("leaves unsure, not_judged, an unprepared entry and Core's own runner failing ungated", async () => {
    const state = { latest: proposal(1, STEPS) };
    const runner: JsonObject = { code: "candidate.trial_port_failed", stoppedBy: { kind: "trial_runner", failure: "TypeError", said: "Core's own trial runner stopped." } };
    const { gate, asked } = gateOver(state, [{ verdict: "unsure" }, { verdict: "not_judged" }, { verdict: "execution_failed", entryPrepared: false, stoppedAtKey: "s2" }, { verdict: "execution_failed", feedback: runner }, { verdict: "yes" }]);
    for (let index = 0; index < 2; index += 1) expect(((await gate.test(receipt(state.latest))).evidence as JsonObject).code).toBeUndefined();
    state.latest = proposal(2, STEPS);
    for (let index = 0; index < 3; index += 1) expect(((await gate.test(receipt(state.latest))).evidence as JsonObject).code).toBeUndefined();
    expect(asked).toHaveLength(5);
  });

  it("crosses the briefs of its subflow through the memory a caller hands each gate", async () => {
    const memory = new AutomationStudioSubflowPendingRepair();
    const first = { latest: proposal(1, STEPS) };
    await gateOver(first, [{ verdict: "execution_failed", stoppedAtKey: "s2" }], { memory }).gate.test(receipt(first.latest));
    expect(memory.standing).toBe(true);
    const repairScope = testScope({ briefId: "brief-2" });
    const second = { latest: { ...proposal(2, STEPS), scope: { ...identity, briefId: "brief-2" } } };
    const repairBrief = gateOver(second, [{ verdict: "yes" }], { memory, scope: repairScope });
    expect((await repairBrief.gate.test(receipt(second.latest))).evidence).toMatchObject({ code: "subflow.trial_from_step_first", repairStep: "s2" });
    expect((await repairBrief.gate.test({ ...receipt(second.latest), from: "s2" })).evidence).toMatchObject({ repairChecked: true });
    expect((await repairBrief.gate.test(receipt(second.latest))).evidence).toMatchObject({ ok: true, verdict: "yes" });
    // A gate given no memory keeps its own.
    const own = { latest: proposal(1, STEPS) };
    expect(((await gateOver(own, [{ verdict: "yes" }]).gate.test(receipt(own.latest))).evidence as JsonObject).verdict).toBe("yes");
  });

  it("counts only a judged whole run of the latest revision for finishing", async () => {
    const state = { latest: proposal(1, STEPS) };
    const { gate } = gateOver(state, [{ verdict: "yes" }]);
    await gate.test(receipt(state.latest));
    expect(gate.completion(state.latest)).toEqual({ ok: true });
    const passed = state.latest;
    state.latest = proposal(2, STEPS);
    await gate.test({ ...receipt(state.latest), from: "s1" });
    expect(gate.completion(state.latest)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_required"] });
    expect(gate.standing(passed)).toMatchObject({ verdict: "yes" });
  });
});
