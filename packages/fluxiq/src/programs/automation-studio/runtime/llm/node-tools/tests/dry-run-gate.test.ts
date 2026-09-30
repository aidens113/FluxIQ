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
// Each step here is a kept press that says how to run it again; the executor
// answers each replayed step from a table by position.
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import {
  automationStudioFlowDraftDryRunGate,
  type AutomationStudioFlowDraftDryRunRefusal,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";

const UNREPRODUCIBLE = "core.replay.unreproducible";
const REPLAYED = "core.replay.replayed";

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
function harness(steps: AutomationStudioFlowDraftStep[], answers: Record<number, string>) {
  const calls: string[] = [];
  const shown: { callId: string; toolId: string; value: JsonValue }[] = [];
  let reused = 0;
  const executeTool = async ({ callId, value }: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push(callId);
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: REPLAYED };
    const code = answers[Number(callId.split(".").pop())] ?? REPLAYED;
    return { kind: "llm_evidence_tool_execution", evidence: { page: callId }, effectApplied: code === REPLAYED, resultCode: code };
  };
  const gate = automationStudioFlowDraftDryRunGate({
    enabled: true,
    steps,
    maxEvidenceBytes: 10_000,
    executeTool,
    reserveEvidence: (value) => JSON.stringify(value).length,
    showEvidence: (entry) => { shown.push(entry); },
    targetMoved: () => {},
    reusedClean: () => { reused += 1; }
  });
  /** One completion: what the gate answered, and the replay calls it made. */
  const complete = async (): Promise<{ answer: AutomationStudioFlowDraftDryRunRefusal | undefined; ran: string[] }> => {
    const from = calls.length;
    const answer = await gate();
    return { answer, ran: calls.slice(from) };
  };
  const lastVerdict = (): JsonObject => shown.filter((entry) => entry.toolId === "core.dry_run").at(-1)!.value as JsonObject;
  return { complete, lastVerdict, reused: () => reused };
}

const refusedFor = (...codes: string[]) => ({ issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE, ...codes] });
const verdictStep = (verdict: JsonObject, position: number) => (verdict.steps as JsonObject[]).find((line) => line.step === position);

describe("an unreproducible step keeps blocking completion until it replays or leaves the Flow", () => {
  it("run 18: refused at 46, refused again at 47 rather than waved, and 48 replays again and is refused", async () => {
    const run = harness([step(2), step(26)], { 26: UNREPRODUCIBLE });

    const at46 = await run.complete();
    expect(at46.answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(at46.ran).toEqual(["dryrun.1.reset", "dryrun.1.2", "dryrun.1.26"]);
    expect(verdictStep(run.lastVerdict(), 26)).not.toHaveProperty("again");

    // The same draft, finished again unchanged: the old rule's "answer".
    const at47 = await run.complete();
    expect(at47.answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(verdictStep(run.lastVerdict(), 26)).toMatchObject({ replayed: "unreproducible", again: true });

    // Nothing clean was cached, so 48 is replayed rather than accepted.
    const at48 = await run.complete();
    expect(at48.ran).toEqual(["dryrun.3.reset", "dryrun.3.2", "dryrun.3.26"]);
    expect(at48.answer).toEqual(refusedFor(UNREPRODUCIBLE));
    expect(run.reused()).toBe(0);
  });

  it("run 21: step 38 refuses the completion at 62 and again at 64, with the draft amended between", async () => {
    const steps = [step(2), step(38)];
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
    for (const decision of [61, 62, 63, 64]) {
      expect((await run.complete()).answer, `decision ${decision}`).toEqual(refusedFor(UNREPRODUCIBLE));
    }
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
