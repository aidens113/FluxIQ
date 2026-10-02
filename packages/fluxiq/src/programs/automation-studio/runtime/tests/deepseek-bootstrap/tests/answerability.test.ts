// A build whose completion cannot answer the instruction is judged, not
// refused, through the real adapter on the stub harness (`harness.ts`): the
// measured run `run-mulryg6h-ff241a12` replayed, once ending on the call
// budget after the judge's no and once converging on the corrected plan. Also
// here, the stub's own draft-observation discriminator those cases rely on.

import { describe, expect, it } from "vitest";
import { create, useBootstrapTempRoot } from "./harness.ts";
import { draftObservation, feedbackRows, PACKED_DRAFT_FIELDS } from "./observation.ts";
import { JUDGE_NO, LOOK_TOOL_ID, RECORDS_INSTRUCTION, repeatedBuildReply } from "./replies.ts";

useBootstrapTempRoot();

describe("draft observation discriminator", () => {
  it("counts malformed object steps and packed rows as withheld inputs", () => {
    const completePackedRow = [1, LOOK_TOOL_ID, { area: "sample" }, null, "yes", "kept", true];
    const packedDraft = { format: "step_rows_v1", fields: [...PACKED_DRAFT_FIELDS] };

    expect(draftObservation({ steps: [{ input: { area: "sample" } }] }, 4_000).withoutInput).toBe(0);
    expect(draftObservation({ ...packedDraft, steps: [completePackedRow] }, 4_000).withoutInput).toBe(0);
    expect(draftObservation({ ...packedDraft, steps: [[...completePackedRow, false, 1, {}]] }, 4_000).withoutInput).toBe(0);
    expect(draftObservation({ steps: [completePackedRow] }, 4_000).withoutInput).toBe(1);
    expect(draftObservation({ ...packedDraft, fields: ["step", "input", "actionId", ...PACKED_DRAFT_FIELDS.slice(3)], steps: [completePackedRow] }, 4_000).withoutInput).toBe(1);
    expect(draftObservation({ ...packedDraft, steps: [completePackedRow.slice(0, 6)] }, 4_000).withoutInput).toBe(1);
    expect(draftObservation({ ...packedDraft, steps: [[1, LOOK_TOOL_ID, null, null, "yes", "kept", true]] }, 4_000).withoutInput).toBe(1);
    expect(draftObservation({ ...packedDraft, steps: [[...completePackedRow, null, null, null, null]] }, 4_000).withoutInput).toBe(1);
  });
});

describe("creating a Flow through an exploration, with no grant", () => {
  // **History: `run-mulryg6h-ff241a12`.** This prefix is that measured run's.
  // Its completion at decision 10 opened and filtered the catalog and read no
  // row, so the answerability check refused it -- and refused the same
  // completion sixteen times more, until the build had spent its twenty-sixth
  // of twenty-six calls and ended as `evidence_budget_exhausted`, with
  // `bootstrap.cannot_answer_instruction` as its issue code and every one of
  // decisions 11-26 shown that refusal as `core.completion_check` feedback.
  //
  // **What it proves now (F43, F44).** The answerability check no longer
  // refuses. The completion at decision 10 is accepted and goes to phase 2: the
  // judge reads the build's test with the check's finding as a note
  // (`llm/harness-options/bootstrap-completion.ts`), naming the columns the
  // instruction asked for. The judge says no, twice (verify asks again on
  // anything but yes), and the build goes on into a second round that carries
  // the judge's account. In this fixture the drafted steps are looks, never a
  // Flow's kind, so the judged Flow has no step to seed a repair with and the
  // second round explores again (`flow-bootstrap/unfinished-build/phases.ts`,
  // "Nothing in the Flow"), told the judge's verdict. Its decisions replay the
  // measured script, its last completion is judged no again, and the build ends
  // honestly on the call budget it spent: nothing was refused for answerability.
  it("accepts the measured run's unanswerable completion, judges it with the answerability note, and ends on the call budget after the judge's no", async () => {
    const run = await create({
      maxCalls: 26,
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 },
      instructionBody: RECORDS_INSTRUCTION,
      webRegistry: true,
      reply: (call) => repeatedBuildReply(call),
      judge: () => JUDGE_NO
    });

    // Decision 10 ends the first round: it is accepted, not refused, so the
    // second round starts its own count at 1. Twenty-six decisions in all.
    expect(run.sentIterations).toEqual([
      ...Array.from({ length: 10 }, (_, index) => index + 1),
      ...Array.from({ length: 16 }, (_, index) => index + 1)
    ]);
    // Two judgements, each asked twice: both Flows read no row, and the judge says so.
    expect(run.judgeRequests).toHaveLength(4);
    expect(run.revealed).toHaveLength(30);
    expect(run.observations.every((observation) => observation.offeredDecisionKinds.length > 0)).toBe(true);
    expect(feedbackRows(run.observations[9], "core.amendment_check")).toEqual([{ toolId: "core.amendment_check", issueCodes: ["already_so"] }]);
    // Nothing was refused for answerability: no decision was shown a completion check, in either round.
    expect(run.observations.every((observation) => observation.completionFeedback.length === 0)).toBe(true);
    expect(run.observations.every((observation) => feedbackRows(observation, "core.completion_check").length === 0)).toBe(true);

    // What the check found travels to the judge instead, as a note naming the columns asked for.
    for (const request of run.judgeRequests) {
      expect(request.notes).toEqual([expect.objectContaining({ code: "bootstrap.cannot_answer_instruction", columns: ["name", "price"] })]);
    }

    // The second round is told the judge's account: what it observed, what was asked, and its advice.
    const secondRound = run.observations.slice(10);
    expect(secondRound).toHaveLength(16);
    expect(secondRound.map((observation) => observation.iteration)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    for (const observation of secondRound) {
      expect(observation.resumed).toMatchObject({
        code: "llm_evidence_loop.explore_again",
        stopped: "judged_wrong",
        draftSteps: 0,
        judgement: {
          stopped: "judged_wrong",
          stepsInFlow: 0,
          judge: { verdict: "no", expected: JUDGE_NO.expected, observed: JUDGE_NO.observed, advice: JUDGE_NO.changed, findings: [] }
        }
      });
    }
    // Its first decision has no draft to finish yet, so it may only look;
    // decisions 2-13 may do anything; 14 and 15 are the wrap-up, which offers
    // only completion and amendments (`AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS`
    // in `llm/loop-budget.ts`); the sixteenth is the last, only completion.
    expect(secondRound[0]?.offeredDecisionKinds).toEqual(["tool_call"]);
    expect(secondRound.slice(1, -3).map((observation) => observation.offeredDecisionKinds)).toEqual(
      Array.from({ length: 12 }, () => ["complete", "amend_draft", "tool_call"])
    );
    expect(secondRound.slice(-3, -1).map((observation) => observation.offeredDecisionKinds)).toEqual(
      Array.from({ length: 2 }, () => ["complete", "amend_draft"])
    );
    expect(secondRound.at(-1)?.offeredDecisionKinds).toEqual(["complete"]);
    expect(secondRound.every((observation) => observation.registeredRecordProducerCount === 1)).toBe(true);
    expect(secondRound.every((observation) => observation.visibleRecordProducerCount === 1)).toBe(true);
    for (const observation of secondRound) {
      // The draft is shown whole (2026-09-30), every step with its argument.
      // The round starts from nothing, and each decision before it added one:
      // decision 14's look falls in the wrap-up and is not run, but it holds a
      // step number, so it is listed as `disposition: look` like every step
      // that is not of a Flow's kind (t193 C7, `flow-draft/entry.ts`).
      expect(observation.draft).toMatchObject({ present: observation.iteration > 1, steps: observation.iteration - 1, unlisted: 0, withoutInput: 0, inputTooLarge: 0 });
    }

    // The ending is the call budget, said as such, with the judge's no as what held it up.
    expect(run.failure).toMatchObject({
      code: "flow_bootstrap.evidence_budget_exhausted",
      stage: "provider_output_validation",
      retryable: true,
      providerInvocation: "attempted",
      providerResponse: "received",
      // Twenty-six decisions at 1,200 in and 150 out, and four judge calls at 400 and 40.
      accounting: { provider: "deepseek", model: "deepseek-flash", inputTokens: 32_800, outputTokens: 4_060, totalTokens: 36_860 },
      evidenceLoop: { iterationCount: 26, decisionCount: 26, toolCallCount: 21, evidenceBytes: expect.any(Number) },
      ending: { kind: "budget_exhausted", bound: "calls", tried: { rounds: 2, decisions: 26, tested: "replayed_clean" } }
    });
    // No round ran out of decisions -- each ended on a completion the judge sent back -- so there is no exhaustion to
    // report, and no completion was refused, so there is no issue code either.
    expect(run.failure?.evidenceLoop).not.toHaveProperty("exhausted");
    expect(run.failure?.issueCodes ?? []).not.toContain("bootstrap.cannot_answer_instruction");
    expect(run.failure?.ending?.message).toMatch(/^The build stopped at its limit of 26 model calls before the Flow was finished\./u);
    expect(run.failure?.ending?.message).toContain("judged not to do what you asked");
    const steps = run.failure?.evidenceLoop?.steps ?? [];
    // The record numbers both rounds' decisions across the build: the second round's 1-16 are 11-26.
    expect(steps.filter((step) => step.iteration === 7)).toHaveLength(2);
    expect(steps.filter((step) => step.iteration === 25)).toHaveLength(2);
    expect(steps.some((step) => step.resultCode === "bootstrap.cannot_answer_instruction")).toBe(false);
    expect(steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ iteration: 8, resultCode: "llm_evidence_loop.draft_amended", amended: 1 }),
      expect.objectContaining({ iteration: 9, resultCode: "llm_evidence_loop.draft_unchanged", amended: 0, amendmentsRefused: [{ step: 2, reason: "already_so", nodeId: "demo.look" }], amendmentRefusals: ["2:already_so:demo.look"] }),
      // Both completions are accepted: the check still observes that no step produces a record, and says so in the
      // record, but it no longer carries an issue code that refuses.
      expect.objectContaining({ iteration: 10, toolId: "core.decision_complete", progress: expect.objectContaining({ answerabilityState: "first_observed" }), answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false } }),
      expect.objectContaining({ iteration: 24, resultCode: "llm_evidence_loop.not_offered" }),
      expect.objectContaining({ iteration: 26, toolId: "core.decision_complete", answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false } })
    ]));
    expect(run.result).toBeUndefined();
    expect(run.stored).toBeUndefined();
    expect(run.adaptationCount).toBe(0);
  }, 180_000);

  // The same prefix, and the same judge's no to the Flow that reads no row.
  // This time the second round, told the judge's account, looks once and then
  // completes with the corrected plan, which keeps `web.output.dom-extract_list`.
  // The judge is asked about that Flow, with no answerability note now, and says
  // yes: the build converges, and its stored record numbers both rounds.
  it("converges through the judge's no when the corrected plan retains the record-producing node", async () => {
    const run = await create({
      maxCalls: 26,
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 },
      instructionBody: RECORDS_INSTRUCTION,
      webRegistry: true,
      // The second round's first decision has nothing drafted, so it is offered only a look; the corrected completion is
      // its second, the build's twelfth.
      reply: (call) => repeatedBuildReply(call, 12),
      judge: (judgeCall) => judgeCall <= 2 ? JUDGE_NO : { answersRequest: "yes" }
    });

    expect(run.sentIterations).toEqual([...Array.from({ length: 10 }, (_, index) => index + 1), 1, 2]);
    // The first Flow is judged no twice; the corrected one yes, once.
    expect(run.judgeRequests).toHaveLength(3);
    expect(run.revealed).toHaveLength(15);
    expect(run.judgeRequests[0]?.notes).toEqual([expect.objectContaining({ code: "bootstrap.cannot_answer_instruction", columns: ["name", "price"] })]);
    // The corrected Flow produces the records, so the check has nothing to note.
    expect(run.judgeRequests[2]?.notes).toEqual([]);
    expect(run.observations.every((observation) => observation.completionFeedback.length === 0)).toBe(true);
    expect(run.observations[11]).toMatchObject({
      iteration: 2,
      completionFeedback: [],
      offeredDecisionKinds: ["complete", "amend_draft", "tool_call"],
      resumed: {
        code: "llm_evidence_loop.explore_again",
        stopped: "judged_wrong",
        judgement: { judge: { verdict: "no", observed: JUDGE_NO.observed, advice: JUDGE_NO.changed } }
      },
      draft: {
        present: true,
        budget: 4_000,
        steps: 1,
        unlisted: 0,
        withoutInput: 0,
        inputTooLarge: 0,
        overBudget: false,
        bytes: expect.any(Number)
      },
      registeredRecordProducerCount: 1,
      visibleRecordProducerCount: 1
    });
    expect(run.observations[11]!.draft.bytes).toBeLessThanOrEqual(run.observations[11]!.draft.budget);
    expect(run.failure).toBeUndefined();
    // Twelve decisions at 1,200 in and 150 out, and three judge calls at 400 and 40.
    expect(run.result).toMatchObject({ status: "proposed", accounting: { inputTokens: 15_600, outputTokens: 1_920, totalTokens: 17_520 } });
    expect(run.stored).toBeDefined();
    expect(run.adaptationCount).toBe(1);
    expect(run.stored?.buildPlan.plan.subflows.flatMap((subflow) => subflow.nodes).map((node) => node.definitionId)).toContain("web.output.dom-extract_list");
    expect(run.stored?.auditEvents[0]?.detail).toMatchObject({ providerCallCount: 12, decisionCount: 12, additionalProviderCallCount: 3, totalProviderCallCount: 15 });
    // Both completions are in the record, numbered across the build; neither was refused.
    expect(run.stored?.evidenceTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ iteration: 10, decision: "complete" }),
      expect.objectContaining({ iteration: 12, decision: "complete" })
    ]));
    expect(run.stored?.evidenceTrace?.some((step) => step.resultCode === "bootstrap.cannot_answer_instruction")).toBe(false);
  }, 180_000);
});
