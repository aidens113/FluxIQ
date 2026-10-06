// The judgement a repair's first decision reads, whole. The user's order,
// 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF ELEMENTS PASSED TO
// MODEL. DO NOT HIDE INFORMATION." Until then the codes and the acts still to do
// stopped at sixteen each.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapJudgeFinished, automationStudioFlowBootstrapJudgeUnfinished, automationStudioFlowBootstrapJudgementValue } from "../judgement.ts";

describe("the judgement a repair reads", () => {
  it("carries every act still to do and every code, not the first sixteen", () => {
    const todo = Array.from({ length: 40 }, (_unused, index) => `a${index + 1}`);
    const codes = Array.from({ length: 30 }, (_unused, index) => `bootstrap.code_${index}`);
    const value = automationStudioFlowBootstrapJudgementValue({
      round: 1,
      stopped: "iterations",
      tested: "replay_failed",
      testIssueCodes: codes,
      failedSteps: [2, 3],
      stepsInFlow: 5,
      done: 1,
      todo,
      lastIssueCodes: codes
    });
    expect(value.actsTodo).toEqual(todo);
    expect(value.testIssueCodes).toEqual(codes);
    expect(value.lastRefusedFor).toEqual(codes);
  });
});

// Live run murwcmx2 (step 0035): the judge's first call said the read's name
// condition was over-broad, the second did not confirm it, and the repair was
// told only "unknown" with Core's sentence. The reading travels on the unknown,
// apart from a no's own fields, so the repair can tell one unconfirmed reading
// from a refutation.
describe("an unknown verdict's unconfirmed reading", () => {
  const SPEND = { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.001 };
  const reading = { expected: "Every pair under $50.", observed: "The name condition left out earbuds with a charging case.", advice: "Narrow the name condition to accessory-only titles." };

  it("reaches the repair's judgement as judge.unconfirmedReading, and never as a no's expected, observed or advice", () => {
    const { judgement } = automationStudioFlowBootstrapJudgeFinished({
      round: 0, steps: [], checklist: () => undefined,
      verdict: { verdict: "unknown", why: "Asked twice, the model never judged it twice.", unconfirmedReading: reading, spent: SPEND }
    });
    expect(judgement.judge).toEqual({ verdict: "unknown", findings: ["Asked twice, the model never judged it twice."], unconfirmedReading: reading });
    const value = automationStudioFlowBootstrapJudgementValue(judgement);
    expect(value.judge).toEqual({ verdict: "unknown", findings: ["Asked twice, the model never judged it twice."], unconfirmedReading: reading });
  });

  it("keeps that one call of the pair said yes, as a flag and nothing of its words, and only where the verdict said so", () => {
    const disputed = automationStudioFlowBootstrapJudgeFinished({
      round: 0, steps: [], checklist: () => undefined,
      verdict: { verdict: "unknown", why: "checked twice, the answers differed", unconfirmedReading: reading, oneCallSaidYes: true, spent: SPEND }
    });
    expect(disputed.judgement.judge).toEqual({ verdict: "unknown", findings: ["checked twice, the answers differed"], unconfirmedReading: reading, oneCallSaidYes: true });
    const unconfirmed = automationStudioFlowBootstrapJudgeFinished({
      round: 0, steps: [], checklist: () => undefined,
      verdict: { verdict: "unknown", why: "checked twice, neither said yes", spent: SPEND }
    });
    expect(unconfirmed.judgement.judge).not.toHaveProperty("oneCallSaidYes");
  });

  it("is absent where the verdict carried none, or carried an empty one", () => {
    for (const unconfirmedReading of [undefined, {}]) {
      const { judgement } = automationStudioFlowBootstrapJudgeFinished({
        round: 0, steps: [], checklist: () => undefined,
        verdict: { verdict: "unknown", why: "unsure", ...(unconfirmedReading ? { unconfirmedReading } : {}), spent: SPEND }
      });
      expect(judgement.judge).not.toHaveProperty("unconfirmedReading");
      expect(automationStudioFlowBootstrapJudgementValue(judgement).judge).not.toHaveProperty("unconfirmedReading");
    }
  });
});

// Live run `run-muwansvz-a2b4a987` (lane C, R2-4): the build-test judge sent
// back a five-step Flow whose step 5 read every results page, and the repair
// round opened on results page 5, where the test left the page. Its first look
// and detect were made there, on the list's last page, and the handle it
// minted could not page. The repair now reads where the step it is to fix
// starts, and to look and detect there, not on the page the test left.
describe("where the step a repair is to fix starts", () => {
  const SPEND = { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.001 };
  function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
    return {
      position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
      ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
    };
  }
  const read = (position: number) => step(position, { actionId: "web.dom.extract_list", effect: "observe", proposes: true });

  it("names the page a judged read starts on, and says to look and detect there", () => {
    const steps = [step(1), step(2), step(3), step(4), read(5)];
    const { judgement } = automationStudioFlowBootstrapJudgeFinished({
      round: 0, steps, checklist: () => undefined,
      verdict: { verdict: "no", findings: ["The read kept 82 rows from 5 pages with no conditions."], records: { stored: 82, refused: 0, missingRequired: 0 }, spent: SPEND }
    });
    expect(automationStudioFlowBootstrapJudgementValue(judgement).whereToFix).toEqual([
      "Step 5 starts on the page step 4 leaves, which need not be the page the test left: a look or a detect made anywhere else describes that page, not the one step 5 runs on. Before you change step 5, get to where it starts the shortest way (mark any step you take only to get there exploratory), then look and detect there."
    ]);
  });

  it("names the page each step that did not work in the test starts on, the first one at the Flow's start", async () => {
    const outcome = (position: number, status: string) => ({ step: position, status }) as unknown as NonNullable<AutomationStudioFlowDraftStep["replayed"]>;
    const judged = await automationStudioFlowBootstrapJudgeUnfinished({
      round: 0, stopped: "iterations", steps: [step(1), step(2), step(3)], lastIssueCodes: [], replayable: () => true, checklist: () => undefined,
      test: async (seed) => {
        seed[0]!.replayed = outcome(1, "unreproducible");
        seed[1]!.replayed = outcome(2, "replayed");
        seed[2]!.replayed = outcome(3, "unreproducible");
        return { issueCodes: ["llm_evidence_loop.replay_failed"] };
      }
    });
    if (judged.kind !== "judged") throw new Error("not judged");
    const failed = judged.judgement;
    expect(failed.failedSteps).toEqual([1, 3]);
    expect(automationStudioFlowBootstrapJudgementValue(failed).whereToFix).toEqual([
      "Step 1 starts where the Flow starts, which need not be the page the test left: a look or a detect made anywhere else describes that page, not the one step 1 runs on. Before you change step 1, get to where it starts the shortest way (mark any step you take only to get there exploratory), then look and detect there.",
      "Step 3 starts on the page step 2 leaves, which need not be the page the test left: a look or a detect made anywhere else describes that page, not the one step 3 runs on. Before you change step 3, get to where it starts the shortest way (mark any step you take only to get there exploratory), then look and detect there."
    ]);
  });

  it("says nothing where no test left the page, or nothing names a step to fix", () => {
    const steps = [step(1), step(2)];
    const unsure = automationStudioFlowBootstrapJudgeFinished({ round: 0, steps, checklist: () => undefined, verdict: { verdict: "unknown", why: "unsure", spent: SPEND } });
    expect(automationStudioFlowBootstrapJudgementValue(unsure.judgement)).not.toHaveProperty("whereToFix");
    const noRead = automationStudioFlowBootstrapJudgeFinished({ round: 0, steps, checklist: () => undefined, verdict: { verdict: "no", findings: ["missed the second act"], spent: SPEND } });
    expect(automationStudioFlowBootstrapJudgementValue(noRead.judgement)).not.toHaveProperty("whereToFix");
  });
});
