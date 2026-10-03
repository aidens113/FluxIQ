// The gate the loop asks before it accepts a result, across attempts.
//
// The verdict of one replay is `../../../flow-draft/tests/dry-run.test.ts`.
// This is what the gate carries from one completion to the next: the clean
// verdict it may reuse, and the steps it has already reported. The shapes are
// the live builds that showed the old rule unsound -- an unreproducible step
// reported once was waved through the next time:
//
//   - run 18 (`run-munpwa5r-e7aefe04`): refused at 46 for step 26, waved at 47,
//     and completion 48 accepted on 47's cached "clean" verdict without
//     replaying;
//   - run 21 (`run-muntufao-7b7bc04a`): dry run 5 at decision 64 "passed" with
//     step 38 unreproducible;
//   - run 33 (`run-munwwkwq-064c4203`): two unreproducible steps waved through
//     at decisions 61-64.
//
// And the cap on replaying one unchanged draft (lane t195, run
// `run-muntu7in-e3dd1972`: one unchanged draft completed fourteen times, 401 of
// the build's 537 seconds spent replaying it, and the build ran out of time):
// an unchanged draft is replayed twice, then judged from what those replays
// found -- still refused, never waved.
//
// Each step here is a kept press that says how to run it again; the executor
// answers each replayed step from a table by position.
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it, vi } from "vitest";
import {
  automationStudioFlowDraftDryRunGate,
  type AutomationStudioFlowDraftDryRunRefusal,
  type AutomationStudioFlowDraftTestReport,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
  AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE,
  automationStudioFlowDraftFlowSignature,
  type AutomationStudioFlowDraftStep
} from "../../../flow-draft/index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES } from "../replay.ts";

const UNREPRODUCIBLE = "core.replay.unreproducible";
const REPLAYED = "core.replay.replayed";
const FAILED = "core.replay.failed";

const step = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: "web.click",
  input: { node: "web.click", parameters: {} },
  ranWith: { node: "web.click", parameters: { target: `#s${position}` }, consequences: [] },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: { location: "https://store.test/start" } },
  ...over
});

/** A gate over `steps`, whose replayed steps answer `answers[position]` (replayed when absent). */
function harness(steps: AutomationStudioFlowDraftStep[], answers: Record<number, string>, options: { requireRunnable?: boolean; requireLibrarySteps?: boolean } = {}) {
  const calls: string[] = [];
  const shown: { callId: string; toolId: string; value: JsonValue }[] = [];
  let reused = 0;
  const reports: AutomationStudioFlowDraftTestReport[] = [];
  const executeTool = async ({ callId, value }: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push(callId);
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: REPLAYED };
    const code = answers[Number(callId.split(".").pop())] ?? REPLAYED;
    return { kind: "llm_evidence_tool_execution", evidence: { page: callId }, effectApplied: code === REPLAYED, resultCode: code };
  };
  const gate = automationStudioFlowDraftDryRunGate({
    enabled: true,
    ...(options.requireRunnable ? { requireRunnable: true } : {}),
    ...(options.requireLibrarySteps ? { requireLibrarySteps: true } : {}),
    steps,
    executeTool,
    accountEvidence: (value) => JSON.stringify(value).length,
    showEvidence: (entry) => { shown.push(entry); },
    targetMoved: () => {},
    reusedClean: () => { reused += 1; },
    observed: (report) => { reports.push(report); }
  });
  /** One completion: what the gate answered, and the replay calls it made. */
  const complete = async (): Promise<{ answer: AutomationStudioFlowDraftDryRunRefusal | undefined; ran: string[] }> => {
    const from = calls.length;
    const answer = await gate();
    return { answer, ran: calls.slice(from) };
  };
  const lastVerdict = (): JsonObject => shown.filter((entry) => entry.toolId === "core.dry_run").at(-1)!.value as JsonObject;
  return { complete, lastVerdict, reused: () => reused, reports, shown };
}

const refusedFor = (...codes: string[]) => ({ issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE, ...codes] });
const verdictStep = (verdict: JsonObject, position: number) => (verdict.steps as JsonObject[]).find((line) => line.step === position);

describe("an unreproducible step keeps blocking completion until it replays or leaves the Flow", () => {
  it("run 18: refused at 46, refused again at 47 rather than waved, and 48 judged from those replays and refused", async () => {
    const run = harness([step(2), step(26)], { 26: UNREPRODUCIBLE });

    const at46 = await run.complete();
    expect(at46.answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(at46.ran).toEqual(["dryrun.1.reset", "dryrun.1.2", "dryrun.1.26"]);
    expect(verdictStep(run.lastVerdict(), 26)).not.toHaveProperty("again");

    // The same draft, finished again unchanged: the old rule's "answer".
    const at47 = await run.complete();
    expect(at47.answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(verdictStep(run.lastVerdict(), 26)).toMatchObject({ replayed: "unreproducible", again: true });

    // Nothing clean was cached, so 48 is not accepted. The draft has now been
    // replayed twice unchanged, so it is judged from those replays rather than
    // replayed a third time -- and judged the same way.
    const at48 = await run.complete();
    expect(at48.ran).toEqual([]);
    expect(at48.answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(verdictStep(run.lastVerdict(), 26)).toMatchObject({ replayed: "unreproducible", again: true });
    expect(run.reused()).toBe(0);
  });

  it("run 21: step 38 refuses the completion at 62 and again at 64, with the draft amended between", async () => {
    // Step 38 does the person's act, as a step a build cannot do without does:
    // a missing act step is never made optional (`../../../flow-draft/sometimes-present.ts`).
    const steps = [step(2), step(38, { acts: ["a1"] })];
    const run = harness(steps, { 38: UNREPRODUCIBLE });
    expect((await run.complete()).answer).toEqual(refusedFor(UNREPRODUCIBLE));
    // An amendment that leaves step 38 as it was: a new step after it.
    steps.push(step(40));
    const at64 = await run.complete();
    expect(at64.ran).toEqual(["dryrun.2.reset", "dryrun.2.2", "dryrun.2.38", "dryrun.2.40"]);
    expect(at64.answer).toEqual(refusedFor(UNREPRODUCIBLE));
  });

  it("run 33: two unreproducible steps refuse every one of four completions", async () => {
    const run = harness([step(2), step(12), step(20)], { 12: UNREPRODUCIBLE, 20: UNREPRODUCIBLE });
    const ran: number[] = [];
    for (const decision of [61, 62, 63, 64]) {
      const completed = await run.complete();
      expect(completed.answer, `decision ${decision}`).toEqual(refusedFor(UNREPRODUCIBLE));
      ran.push(completed.ran.length);
    }
    // Replayed at 61 and 62, judged from those at 63 and 64.
    expect(ran).toEqual([4, 4, 0, 0]);
    expect((run.lastVerdict().steps as JsonObject[]).filter((line) => line.again === true).map((line) => line.step)).toEqual([12, 20]);
  });

  it("passes the same step once it replays, and then reuses that clean verdict without replaying", async () => {
    const answers: Record<number, string> = { 26: UNREPRODUCIBLE };
    const run = harness([step(2), step(26)], answers);
    expect((await run.complete()).answer).toEqual(refusedFor(UNREPRODUCIBLE));
    delete answers[26];
    const clean = await run.complete();
    expect(clean.answer).toBeUndefined();
    expect(clean.ran).toEqual(["dryrun.2.reset", "dryrun.2.2", "dryrun.2.26"]);
    expect(run.reused()).toBe(0);
    // A truly clean draft completed again unchanged is not replayed again.
    const again = await run.complete();
    expect(again).toEqual({ answer: undefined, ran: [] });
    expect(run.reused()).toBe(1);
  });

  it("passes the same step once it is marked optional, or only_if on a check", async () => {
    for (const routing of [{ kind: "optional" as const }, { kind: "only_if" as const, check: "d2" }]) {
      const steps = [step(2), step(26)];
      const run = harness(steps, { 26: UNREPRODUCIBLE });
      expect((await run.complete()).answer, routing.kind).toEqual(refusedFor(UNREPRODUCIBLE));
      steps[1]!.routing = routing;
      // Still replayed, and still unreproducible: the Flow says it is not always there.
      const marked = await run.complete();
      expect(marked.ran, routing.kind).toContain("dryrun.2.26");
      expect(marked.answer, routing.kind).toBeUndefined();
    }
  });

  it("passes once the step is dropped, because a step not proposed is not replayed", async () => {
    const steps = [step(2), step(26)];
    const run = harness(steps, { 26: UNREPRODUCIBLE });
    expect((await run.complete()).answer).toEqual(refusedFor(UNREPRODUCIBLE));
    steps[1]!.disposition = "dropped";
    const dropped = await run.complete();
    expect(dropped.ran).toEqual(["dryrun.2.reset", "dryrun.2.2"]);
    expect(dropped.answer).toBeUndefined();
  });
});

// Run 33 (`run-munwwkwq-064c4203`, t195-w19a B1): the kept consent press `d3`
// came back unreproducible in both dry runs because the site remembered the
// decline. Its host now answers `remembered` for a target gone from the very
// page the step acted on (t195-w20b).
describe("a step the site remembers", () => {
  it("passes the gate on the first completion, stays in the draft as it is, and is recorded as remembered", async () => {
    const steps = [step(2), step(3), step(4)];
    const run = harness(steps, { 3: AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.remembered });
    const first = await run.complete();
    expect(first.answer).toBeUndefined();
    expect(first.ran).toEqual(["dryrun.1.reset", "dryrun.1.2", "dryrun.1.3", "dryrun.1.4"]);
    expect(steps.map((each) => [each.disposition, each.routing?.kind ?? null])).toEqual([["kept", null], ["kept", null], ["kept", null]]);
    expect(steps[1]?.replayed).toMatchObject({ status: "replayed", resultCode: "core.replay.remembered" });
  });
});

// t194's run `run-mup2u8o3-6697c4be`: the test from the start kept the build's
// cookie consent, so the authored Accept was unreproducible while every step
// after it replayed, and the build had no money left to mark it optional.
describe("a step the test proves is only sometimes there", () => {
  it("run 9: the missing cookie Accept is made optional and the draft passes", async () => {
    const steps = [step(2), step(3), step(4), step(8, { acts: ["a1"] })];
    const run = harness(steps, { 3: UNREPRODUCIBLE });

    const first = await run.complete();
    expect(first.answer).toBeUndefined();
    expect(first.ran).toEqual(["dryrun.1.reset", "dryrun.1.2", "dryrun.1.3", "dryrun.1.4", "dryrun.1.8"]);
    expect(steps[1]!.routing).toEqual({ kind: "optional" });
    expect(steps[1]!.replayed).toMatchObject({ status: "unreproducible", madeOptional: true });
    expect(steps.filter((_, index) => index !== 1).map((draftStep) => draftStep.routing)).toEqual([undefined, undefined, undefined]);
    // It passed, so it is a clean verdict: completed again unchanged, nothing is replayed.
    expect(await run.complete()).toEqual({ answer: undefined, ran: [] });
  });

  it("refuses, and marks nothing, when the missing step does one of the person's acts", async () => {
    const steps = [step(2), step(3, { acts: ["a1"] }), step(4)];
    const run = harness(steps, { 3: UNREPRODUCIBLE });
    expect((await run.complete()).answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(steps[1]!.routing).toBeUndefined();
  });

  it("refuses, and marks nothing, when a later step did not replay", async () => {
    const steps = [step(2), step(3), step(4)];
    const run = harness(steps, { 3: UNREPRODUCIBLE, 4: FAILED });
    expect((await run.complete()).answer).toEqual(refusedFor(UNREPRODUCIBLE, FAILED));
    expect(steps[1]!.routing).toBeUndefined();
  });

  it("refuses, and marks nothing, when another step still stands in the way", async () => {
    // Step 3 alone would be made optional; step 2 failing refuses the draft, so
    // the refusal the model answers is left whole rather than half-answered.
    const steps = [step(2), step(3), step(4)];
    const run = harness(steps, { 2: FAILED, 3: UNREPRODUCIBLE });
    expect((await run.complete()).answer).toEqual(refusedFor(FAILED, UNREPRODUCIBLE));
    expect(steps[1]!.routing).toBeUndefined();
  });
});

// The cap on replaying one unchanged draft, over presses that name only a target.
function pressOn(position: number, target: string): AutomationStudioFlowDraftStep {
  return {
    position,
    id: `d${position}`,
    iteration: position,
    callId: `call.${position}`,
    actionId: "web.output.dom-click",
    toolId: "core.run_node",
    input: { node: "web.output.dom-click", parameters: { target } },
    ranWith: { node: "web.output.dom-click", parameters: { target } },
    replay: { from: { url: "https://shop.test/" } },
    effect: "mutate",
    effectApplied: true,
    disposition: "kept"
  } as AutomationStudioFlowDraftStep;
}

/** A page on which the step pressing `#gone` no longer replays, as a Confirm already pressed does not. */
function gate(steps: AutomationStudioFlowDraftStep[], reusedClean?: () => void) {
  const executeTool = vi.fn(async ({ value }: { value: JsonObject }): Promise<JsonValue> => {
    const resultCode = value.replay === "reset"
      ? AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed
      : (value.parameters as { target?: string } | undefined)?.target === "#gone" ? AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.failed : AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed;
    return { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode } as unknown as JsonValue;
  });
  const shown: string[] = [];
  const targetMoved = vi.fn();
  const observed = vi.fn();
  const dryRun = automationStudioFlowDraftDryRunGate({
    enabled: true,
    steps,
    executeTool,
    accountEvidence: () => 1,
    showEvidence: (entry) => shown.push(entry.callId),
    targetMoved,
    observed,
    ...(reusedClean ? { reusedClean } : {})
  });
  return { dryRun, executeTool, shown, targetMoved, observed };
}

describe("the dry run of a draft completed again unchanged", () => {
  it("is replayed twice, then refused from what those replays found without a third", async () => {
    const steps = [pressOn(1, "#open"), pressOn(2, "#gone")];
    const run = gate(steps);

    const first = await run.dryRun();
    const second = await run.dryRun();
    expect(run.executeTool).toHaveBeenCalledTimes(6);
    const third = await run.dryRun();
    const fourth = await run.dryRun();

    expect(first).toMatchObject({ issueCodes: expect.arrayContaining(["core.replay.failed"]) });
    expect([second, third, fourth]).toEqual([first, first, first]);
    expect(run.executeTool).toHaveBeenCalledTimes(6);
    expect(run.targetMoved).toHaveBeenCalledTimes(2);
    expect(run.shown.at(-1)).toMatch(/\.again$/u);
  });

  it("is replayed again, not judged from the old replays, when a routing word makes the failing step one the Flow does not always run", async () => {
    // User rule (2026-10-02): marking a step optional changes the Flow, and a
    // changed Flow is finished only by a run of it -- never by an earlier
    // run's outcomes judged again under the new routing.
    const steps = [pressOn(1, "#open"), pressOn(2, "#gone")];
    const reused = vi.fn();
    const run = gate(steps, reused);
    await run.dryRun();
    await run.dryRun();

    steps[1]!.routing = { kind: "optional" };
    expect(await run.dryRun()).toBeUndefined();
    expect(run.executeTool).toHaveBeenCalledTimes(9);
    expect(reused).not.toHaveBeenCalled();
  });

  it("is replayed again once the steps themselves change", async () => {
    const steps = [pressOn(1, "#open"), pressOn(2, "#gone")];
    const run = gate(steps);
    await run.dryRun();

    steps[1] = pressOn(2, "#there");
    expect(await run.dryRun()).toBeUndefined();
    expect(run.executeTool).toHaveBeenCalledTimes(6);
  });
});

// What the test observed (t195-w26a), reported on every pass and never on a
// refusal, for a judge of what the build actually did.
describe("what a passing test reports", () => {
  it("reports a clean replay's observations, verified steps included, and reuses them for the same draft", async () => {
    const steps = [step(2), step(3, { ranWith: { node: "web.click", parameters: { target: "#s3" }, consequences: ["create_new"] } }), step(4)];
    const run = harness(steps, {});
    expect((await run.complete()).answer).toBeUndefined();
    expect(run.reports).toHaveLength(1);
    const first = run.reports[0]!;
    expect(first.reused).toBe(false);
    expect(first.verdict.ok).toBe(true);
    expect(first.verdict.outcomes.find((outcome) => outcome.step === 3)?.mode).toBe("verify");
    expect(first.observations).toEqual([
      { step: 2, stepId: "d2", resultCode: REPLAYED, evidence: { page: "dryrun.1.2" } },
      { step: 3, stepId: "d3", resultCode: REPLAYED, evidence: { page: "dryrun.1.3" } },
      { step: 4, stepId: "d4", resultCode: REPLAYED, evidence: { page: "dryrun.1.4" } }
    ]);

    // Completed again unchanged: not replayed, and reported as the first replay's.
    expect(await run.complete()).toEqual({ answer: undefined, ran: [] });
    expect(run.reports).toHaveLength(2);
    expect(run.reports[1]).toEqual({ verdict: first.verdict, observations: first.observations, reused: true, signature: first.signature });
    expect(first.signature).toBe(automationStudioFlowDraftFlowSignature(steps));
  });

  it("reports nothing for a refused replay", async () => {
    const run = harness([step(2), step(26)], { 26: UNREPRODUCIBLE });
    expect((await run.complete()).answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect((await run.complete()).answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect((await run.complete()).answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(run.reports).toEqual([]);
  });

  it("reports a pass after the made-optional step with the verdict that passed, keyed on the Flow with that step optional", async () => {
    const steps = [step(2), step(3), step(4, { acts: ["a1"] })];
    const before = automationStudioFlowDraftFlowSignature(steps);
    const run = harness(steps, { 3: UNREPRODUCIBLE });
    expect((await run.complete()).answer).toBeUndefined();
    expect(run.reports).toHaveLength(1);
    expect(run.reports[0]).toMatchObject({ reused: false, verdict: { ok: true } });
    expect(run.reports[0]!.observations.map((each) => each.step)).toEqual([2, 3, 4]);
    // The run that proved step 3 optional is a run of the Flow with it optional.
    expect(run.reports[0]!.signature).toBe(automationStudioFlowDraftFlowSignature(steps));
    expect(run.reports[0]!.signature).not.toBe(before);
  });

  it("reports a new replay's observations when a twice-replayed draft passes once its failing step is marked optional", async () => {
    const steps = [pressOn(1, "#open"), pressOn(2, "#gone")];
    const run = gate(steps);
    await run.dryRun();
    await run.dryRun();
    expect(run.observed).not.toHaveBeenCalled();

    steps[1]!.routing = { kind: "optional" };
    expect(await run.dryRun()).toBeUndefined();
    expect(run.executeTool).toHaveBeenCalledTimes(9);
    expect(run.observed).toHaveBeenCalledTimes(1);
    const report = run.observed.mock.calls[0]![0] as AutomationStudioFlowDraftTestReport;
    expect(report.reused).toBe(false);
    expect(report.verdict).toMatchObject({ ok: true, attempt: 3 });
    expect(report.signature).toBe(automationStudioFlowDraftFlowSignature(steps));
    expect(report.observations).toEqual([
      { step: 1, stepId: "d1", resultCode: AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed, evidence: {} },
      { step: 2, stepId: "d2", resultCode: AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.failed, evidence: {} }
    ]);
  });
});

// User rule (2026-10-02): a Flow is finished only after a run of the whole Flow
// from its start was judged success on the Flow as it finally stands; any edit
// after that run needs another full run. The gate's clean verdict is therefore
// a verdict about the Flow -- routing and settings included -- not only about
// the steps a replay sends.
describe("a clean verdict is about the Flow as it stands", () => {
  it("replays again when routing changes after a clean replay", async () => {
    const steps = [step(2), step(3), step(4)];
    const run = harness(steps, {});
    expect((await run.complete()).answer).toBeUndefined();
    expect(await run.complete()).toEqual({ answer: undefined, ran: [] });

    steps[1]!.routing = { kind: "optional" };
    const changed = await run.complete();
    expect(changed.answer).toBeUndefined();
    expect(changed.ran).toEqual(["dryrun.2.reset", "dryrun.2.2", "dryrun.2.3", "dryrun.2.4"]);
    expect(run.reports.map((report) => report.reused)).toEqual([false, true, false]);
    expect(run.reports[2]!.signature).toBe(automationStudioFlowDraftFlowSignature(steps));
    expect(run.reports[2]!.signature).not.toBe(run.reports[0]!.signature);
  });

  it("replays again when a step's settings change after a clean replay", async () => {
    const steps = [step(2), step(3)];
    const run = harness(steps, {});
    expect((await run.complete()).answer).toBeUndefined();
    steps[0]!.settings = { waitMs: 500 };
    expect((await run.complete()).ran).toEqual(["dryrun.2.reset", "dryrun.2.2", "dryrun.2.3"]);
  });
});

// A re-authored Flow is an extend build seeded with the earlier Flow's steps
// (`../draft-from-flow.ts`): carried steps `f<n>` with no `ranWith`, no
// `replay` and no consequence declaration. Before this gate such a draft was
// simply not replayable, the test never ran, and the build finished
// unverified -- then was approved and applied before anything ran it whole.
describe("a Flow holding steps carried from an earlier Flow that never ran in this build", () => {
  const carried = (position: number): AutomationStudioFlowDraftStep => {
    const { ranWith: _ranWith, replay: _replay, ...rest } = step(position, { id: `f${position}` });
    return rest;
  };

  it("is refused full_run_required, naming those steps, with no replay and nothing observed", async () => {
    const steps = [carried(1), step(2), carried(3)];
    const run = harness(steps, {});
    expect(await run.complete()).toEqual({ answer: { issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] }, ran: [] });
    expect(run.reports).toEqual([]);
    expect(run.reused()).toBe(0);
    expect(run.lastVerdict()).toMatchObject({
      code: AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE,
      steps: [{ step: 1, replayed: "not_run_in_this_build" }, { step: 3, replayed: "not_run_in_this_build" }]
    });
    expect(run.shown.at(-1)).toMatchObject({ callId: "core.dry_run.unrun.1", toolId: "core.dry_run" });
  });

  it("does not move the target or touch the executor", async () => {
    const steps = [carried(1), pressOn(2, "#open")];
    const run = gate(steps);
    expect(await run.dryRun()).toEqual({ issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] });
    expect(await run.dryRun()).toEqual({ issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] });
    expect(run.executeTool).not.toHaveBeenCalled();
    expect(run.targetMoved).not.toHaveBeenCalled();
    expect(run.observed).not.toHaveBeenCalled();
    expect(run.shown).toEqual(["core.dry_run.unrun.1", "core.dry_run.unrun.2"]);
  });

  it("is replayed once each carried step was rerun and carries ranWith and replay", async () => {
    const steps = [carried(1), step(2)];
    const run = harness(steps, {});
    expect((await run.complete()).answer).toEqual({ issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] });
    steps[0] = step(1, { id: "f1" });
    const rerun = await run.complete();
    expect(rerun.answer).toBeUndefined();
    expect(rerun.ran).toEqual(["dryrun.1.reset", "dryrun.1.1", "dryrun.1.2"]);
    expect(run.reports[0]!.signature).toBe(automationStudioFlowDraftFlowSignature(steps));
  });

  // t244, beyond carried steps: a build's Flow the test cannot run whole for
  // any reason is refused at completion, rather than passed untested and left
  // for a judge to be paid to read a test that never ran. Only a caller that
  // authors a Flow asks for this (`requireRunnable`); the recovery ladder's
  // exploration authors none, and finishes with whatever it ran.
  it("refuses a build's step that left nothing to run it again with as cannot_run_again", async () => {
    const { replay: _replay, ...bare } = step(2);
    const run = harness([step(1), bare], {}, { requireRunnable: true });
    expect(await run.complete()).toEqual({ answer: { issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] }, ran: [] });
    expect(run.lastVerdict()).toMatchObject({ steps: [{ step: 2, replayed: "cannot_run_again" }] });
  });

  it("refuses a build's first step with nothing to put the target back where the Flow starts", async () => {
    const first = step(1);
    const run = harness([{ ...first, replay: { produced: { rows: 1 } } }, step(2)], {}, { requireRunnable: true });
    expect(await run.complete()).toEqual({ answer: { issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] }, ran: [] });
    expect(run.lastVerdict()).toMatchObject({ steps: [{ step: 1, replayed: "cannot_run_again" }] });
  });

  it("refuses a build's Flow none of whose steps ran in this build, naming none", async () => {
    const run = harness([{ ...step(1), disposition: "dropped" }], {}, { requireRunnable: true });
    expect(await run.complete()).toEqual({ answer: { issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] }, ran: [] });
    expect(run.lastVerdict()).toMatchObject({ steps: [], instruction: expect.stringContaining("no step of this Flow has run in this build") });
  });

  // Where the build offers the node library, a step taken through another tool
  // sends the Flow to the plan the reply wrote out, which never ran: the test
  // would run one Flow and the judge's yes be stored on another.
  it("refuses a build's step taken off the node library, where the library is offered", async () => {
    const library = (position: number) => step(position, { toolId: "core.run_node" });
    const run = harness([library(1), step(2, { toolId: "domain.act" }), library(3)], {}, { requireRunnable: true, requireLibrarySteps: true });
    expect(await run.complete()).toEqual({ answer: { issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] }, ran: [] });
    expect(run.lastVerdict()).toMatchObject({ steps: [{ step: 2, replayed: "not_a_library_step" }] });
    const offered = harness([library(1), library(2)], {}, { requireRunnable: true, requireLibrarySteps: true });
    expect((await offered.complete()).answer).toBeUndefined();
  });

  it("passes a step of a host's own tool where no library is offered: the reply's plan is all it has", async () => {
    const run = harness([step(1, { toolId: "domain.act" })], {}, { requireRunnable: true });
    expect((await run.complete()).answer).toBeUndefined();
  });

  it("passes, untested, what a caller that authors no Flow cannot run again", async () => {
    const { replay: _replay, ...bare } = step(2);
    const run = harness([step(1), bare], {});
    expect(await run.complete()).toEqual({ answer: undefined, ran: [] });
  });

  it("does not count a carried step the model dropped", async () => {
    const steps = [carried(1), step(2)];
    steps[0]!.disposition = "dropped";
    const run = harness(steps, {});
    expect((await run.complete()).answer).toBeUndefined();
  });
});

describe("a refusal whose step ran on a page taken steps made", () => {
  it("run muqk4u32: names the taken steps that changed the page on the way and are not in the Flow (t174 F41)", async () => {
    // 1 is kept and left the page at b; 2 was taken, not kept, and moved it to
    // c; 3 ran on c. The test runs 1 then 3, never 2, so 3 is not on its page.
    const steps = [
      step(1, { stateBefore: "a", stateAfter: "b" }),
      step(2, { disposition: "taken", stateBefore: "b", stateAfter: "c" }),
      step(3, { stateBefore: "c", stateAfter: "d" })
    ];
    const run = harness(steps, { 3: UNREPRODUCIBLE });
    const refused = await run.complete();
    expect(refused.answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(refused.ran).toEqual(["dryrun.1.reset", "dryrun.1.1", "dryrun.1.3"]);
    expect(run.lastVerdict().notInFlow).toBe("Step 2 changed the page on the way to step 3 when you ran it, and is not in the Flow, so the test never reached the page step 3 acted on: add it (amend_draft add).");
    // Judged again from the same replays, it says so again.
    await run.complete();
    const again = await run.complete();
    expect(again.ran).toEqual([]);
    expect(run.lastVerdict().notInFlow).toContain("Step 2 changed the page");
  });
});
