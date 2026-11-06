// What a later attempt's proof reads: what an attempt left, by the digest the task's memory names it
// by, and that a whole run judged yes is said to be ready.
import { describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, parseAutomationStudioSavedState, type AutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import { automationStudioFlowDraftStepIsProposed } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstStepsDigest } from "../../task-memory/index.ts";
import { savedStep } from "../../tests/fake-library-engine.ts";
import { automationStudioAnswerFirstOutcomeOfRecord } from "../outcome-of-record.ts";
import type { AutomationStudioAnswerFirstAttemptRecord } from "../record.ts";

const FLOW = "flow.1";
const STEPS = [savedStep(1, "domain.library.read", {}, { label: "Read the list" }), savedStep(2, "domain.library.renew", {}, { label: "Renew" })];
const DIGEST = automationStudioAnswerFirstStepsDigest(STEPS.filter(automationStudioFlowDraftStepIsProposed));

function attempt(fields: Partial<AutomationStudioTaskAttempt> = {}): AutomationStudioTaskAttempt {
  return {
    taskId: "task.1", attemptId: "attempt.1", ordinal: 1, projectId: "project.1", flowId: FLOW, path: "explore", status: "achieved",
    spend: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 0.01, ms: 10 }, budget: { usd: 5 }, liveSteps: 4,
    loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1000, endedAtMs: 2000, ...fields
  } as AutomationStudioTaskAttempt;
}

const RESULT = (attemptId: string) => ({ attemptId, kind: "done_on_site", label: "confirmed", timesChecked: 1, source: "exploration", acts: [{ id: "act.1", what: "Renewed", where: "On the site", classes: ["modify_existing"], state: "landed" }] });

function outcomeOf(fields: Partial<AutomationStudioTaskAttempt>, record: { steps?: typeof STEPS; candidateId?: string } = { steps: STEPS, candidateId: "candidate.1" }) {
  const row = attempt(fields);
  const result = { ...RESULT(row.attemptId), source: row.path === "explore" ? "exploration" : "flow" };
  const kept: unknown = { attempt: row, result, ...record };
  return automationStudioAnswerFirstOutcomeOfRecord([kept as AutomationStudioAnswerFirstAttemptRecord], 0, FLOW);
}

describe("what an attempt left", () => {
  it("names saved steps by the digest of what the Flow holds, and the chip reads through the contract", () => {
    const { saved } = outcomeOf({});
    expect(saved).toEqual({ state: "partly_works", trust: "unproven", flowId: FLOW, savedAtMs: 2000, stepsDigest: DIGEST });
    expect(parseAutomationStudioSavedState(saved).ok).toBe(true);
  });

  it("says ready once a whole run of the saved Flow was judged yes, with what it ran named", () => {
    expect(outcomeOf({ path: "run_flow" }).saved).toEqual({ state: "ready", trust: "provisional", flowId: FLOW, savedAtMs: 2000, lastWorkedAtMs: 2000, stepsDigest: DIGEST });
  });

  it("does not say ready of a run that sent nothing, or one the rounds had to finish", () => {
    expect(outcomeOf({ path: "run_flow", liveSteps: 0 }).saved).toMatchObject({ state: "partly_works", trust: "unproven" });
    expect(outcomeOf({ path: "run_flow_then_repair" }).saved).toMatchObject({ state: "partly_works", trust: "unproven" });
    expect(outcomeOf({ path: "run_flow_then_explore" }).saved).toMatchObject({ state: "partly_works", trust: "unproven" });
  });

  it("names a step that did something lasting and is out of the saved Flow, and only such a step", () => {
    const pressed = savedStep(3, "domain.library.save", {}, { consequences: ["create_new"], label: "Save: Round pine dining table", disposition: "dropped" });
    const looked = savedStep(4, "domain.library.read", {}, { label: "Look at the list", disposition: "dropped" });
    const row = { ...pressed, acts: ["create_new"] };
    const { saved } = outcomeOf({}, { steps: [...STEPS, row, looked], candidateId: "candidate.1" });
    expect(saved).toEqual({ state: "partly_works", trust: "unproven", flowId: FLOW, savedAtMs: 2000, stepsDigest: DIGEST, leftOut: ["Save: Round pine dining table"] });
    expect(parseAutomationStudioSavedState(saved).ok).toBe(true);
    expect(outcomeOf({}).saved).not.toHaveProperty("leftOut");
  });

  it("holds no digest for what was not saved as steps", () => {
    expect(outcomeOf({}, { steps: STEPS }).saved).toEqual({ state: "notes_only", trust: "unproven", savedAtMs: 2000 });
    expect(outcomeOf({}, {}).saved).toBeUndefined();
  });

  it("carries what a later attempt began from, through the attempt's own parse", () => {
    const startedFrom = { route: "use" as const, attemptId: "attempt.0", stepsDigest: DIGEST };
    expect(outcomeOf({ startedFrom }).attempt.startedFrom).toEqual(startedFrom);
    expect(outcomeOf({}).attempt.startedFrom).toBeUndefined();
  });
});
