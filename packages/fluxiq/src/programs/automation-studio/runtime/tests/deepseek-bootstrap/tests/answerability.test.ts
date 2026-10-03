// A build whose completion cannot answer the instruction is judged, not
// refused, through the real adapter on the stub harness (`harness.ts`): the
// measured run `run-mulryg6h-ff241a12` replayed, once ending on its spent calls
// after the repair round's Flow is judged the same no and once converging on the
// corrected plan. Also here, the stub's own draft-observation discriminator
// those cases rely on.

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
  // the judge's account.
  //
  // **Since t244 (user 2026-10-02).** A Flow is judged only once it ran whole
  // from its start, so the script's six looks are added to the Flow as they
  // run (`lookAdded`): a completion whose Flow holds no step that ran in this
  // build is refused `llm_evidence_loop.full_run_required` and never judged. It
  // used to be judged as a plan written out whole, with no step in it, and the
  // second round explored again from nothing. Now the judged Flow holds those
  // six steps, so the second round is a repair seeded with them
  // (`llm_evidence_loop.repair`, `flow-bootstrap/unfinished-build/phases.ts`),
  // told the judge's verdict. Its decisions replay the measured script, its last
  // completion is tested whole and judged no again with the same finding. Since
  // t195-w37 a judge that names its fix buys one more round, and this build has
  // spent every call it had, so it ends on that budget rather than "not doable":
  // nothing was refused for answerability.
  it("accepts the measured run's unanswerable completion, judges it with the answerability note, and, when the repair's Flow is judged the same no with a fix named, ends on its spent calls rather than as not doable", async () => {
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

    // What each judge read is the test of the whole Flow: the six steps added, run again from its start.
    expect(run.judgeRequests.map((request) => request.stepCount)).toEqual([6, 6, 6, 6]);

    // The second round is a repair of the judged Flow, told the judge's account: what it observed, what was asked, and
    // its advice.
    const secondRound = run.observations.slice(10);
    expect(secondRound).toHaveLength(16);
    expect(secondRound.map((observation) => observation.iteration)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    for (const observation of secondRound) {
      expect(observation.resumed).toMatchObject({
        code: "llm_evidence_loop.repair",
        stopped: "judged_wrong",
        draftSteps: 6,
        judgement: {
          stopped: "judged_wrong",
          stepsInFlow: 6,
          judge: { verdict: "no", expected: JUDGE_NO.expected, observed: JUDGE_NO.observed, advice: JUDGE_NO.changed, findings: [] }
        }
      });
    }
    // Its first decision is told to look first at the page the test left, so it
    // may look or amend but not complete; decisions 2-13 may do anything; 14
    // and 15 are the wrap-up, which offers only completion and amendments
    // (`AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS` in
    // `llm/loop-budget.ts`); the sixteenth is the last, only completion. A tool
    // call is offered in two shapes since t244: a domain tool, and `core.run_flow`
    // (`llm/node-tools/run-flow.ts`).
    expect(secondRound[0]?.offeredDecisionKinds).toEqual(["amend_draft", "tool_call", "tool_call"]);
    expect(secondRound.slice(1, -3).map((observation) => observation.offeredDecisionKinds)).toEqual(
      Array.from({ length: 12 }, () => ["complete", "amend_draft", "tool_call", "tool_call"])
    );
    expect(secondRound.slice(-3, -1).map((observation) => observation.offeredDecisionKinds)).toEqual(
      Array.from({ length: 2 }, () => ["complete", "amend_draft"])
    );
    expect(secondRound.at(-1)?.offeredDecisionKinds).toEqual(["complete"]);
    expect(secondRound.every((observation) => observation.registeredRecordProducerCount === 1)).toBe(true);
    expect(secondRound.every((observation) => observation.visibleRecordProducerCount === 1)).toBe(true);
    for (const observation of secondRound) {
      // The draft is shown whole (2026-09-30), every step with its argument.
      // The round starts from the judged Flow's six steps, and each decision
      // before it added one: decision 14's look falls in the wrap-up and is not
      // run, but it holds a step number, so it is listed as `disposition: look`
      // like every step that is not of a Flow's kind (t193 C7, `flow-draft/entry.ts`).
      expect(observation.draft).toMatchObject({ present: true, steps: 6 + observation.iteration - 1, unlisted: 0, withoutInput: 0, inputTooLarge: 0 });
    }

    // The repair's Flow, tested whole, was judged the same no as the round before, so the repair made no progress.
    // The judge named its fix and did not say the request can no longer be had, so the build would take one more
    // round (t195-w37: "not doable" only when there is absolutely no way) -- but it had spent every call it had, so
    // it ends on that budget, honestly, and a retry carries on from the Flow so far.
    expect(run.failure).toMatchObject({
      code: "flow_bootstrap.evidence_budget_exhausted",
      stage: "provider_output_validation",
      retryable: true,
      providerInvocation: "attempted",
      providerResponse: "received",
      // Twenty-six decisions at 1,200 in and 150 out, and four judge calls at 400 and 40.
      accounting: { provider: "deepseek", model: "deepseek-flash", inputTokens: 32_800, outputTokens: 4_060, totalTokens: 36_860 },
      evidenceLoop: { iterationCount: 26, decisionCount: 26, toolCallCount: 21, evidenceBytes: expect.any(Number) },
      ending: { kind: "budget_exhausted", tried: { rounds: 2, decisions: 26, stepsInFlow: 6, tested: "replayed_clean" } }
    });
    // No round ran out of decisions -- each ended on a completion the judge sent back -- so there is no exhaustion to
    // report, and no completion was refused, so there is no issue code either.
    expect(run.failure?.evidenceLoop).not.toHaveProperty("exhausted");
    expect(run.failure?.issueCodes ?? []).not.toContain("bootstrap.cannot_answer_instruction");
    expect(run.failure?.ending?.message).not.toContain("found no way");
    expect(run.failure?.ending?.message).not.toMatch(/^I could not build this Flow/u);
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
  // This time the second round, a repair of the six steps that ran (t244: the
  // judged Flow is the one that ran whole), told the judge's account, looks once
  // and then completes with the corrected plan, which keeps
  // `web.output.dom-extract_list`. That Flow is tested whole again and the judge
  // is asked about it, with no answerability note now, and says yes: the build
  // converges, and its stored record numbers both rounds.
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
    // The first Flow is judged no twice; the corrected one yes, twice (a finishing yes is confirmed, t194-w71).
    expect(run.judgeRequests).toHaveLength(4);
    expect(run.revealed).toHaveLength(16);
    expect(run.judgeRequests[0]?.notes).toEqual([expect.objectContaining({ code: "bootstrap.cannot_answer_instruction", columns: ["name", "price"] })]);
    // The corrected Flow produces the records, so the check has nothing to note.
    expect(run.judgeRequests[2]?.notes).toEqual([]);
    expect(run.judgeRequests[3]?.notes).toEqual([]);
    // Each judge read a test of the whole Flow, its six added steps run again from the start.
    expect(run.judgeRequests.map((request) => request.stepCount)).toEqual([6, 6, 6, 6]);
    expect(run.observations.every((observation) => observation.completionFeedback.length === 0)).toBe(true);
    expect(run.observations[11]).toMatchObject({
      iteration: 2,
      completionFeedback: [],
      offeredDecisionKinds: ["complete", "amend_draft", "tool_call", "tool_call"],
      resumed: {
        code: "llm_evidence_loop.repair",
        draftSteps: 6,
        stopped: "judged_wrong",
        judgement: { judge: { verdict: "no", observed: JUDGE_NO.observed, advice: JUDGE_NO.changed } }
      },
      draft: {
        present: true,
        budget: 4_000,
        // The six steps the repair was seeded with, and the look it took first.
        steps: 7,
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
    // Twelve decisions at 1,200 in and 150 out, and four judge calls at 400 and 40 (the finishing yes confirmed, t194-w71).
    expect(run.result).toMatchObject({ status: "proposed", accounting: { inputTokens: 16_000, outputTokens: 1_960, totalTokens: 17_960 } });
    expect(run.stored).toBeDefined();
    expect(run.adaptationCount).toBe(1);
    expect(run.stored?.buildPlan.plan.subflows.flatMap((subflow) => subflow.nodes).map((node) => node.definitionId)).toContain("web.output.dom-extract_list");
    expect(run.stored?.auditEvents[0]?.detail).toMatchObject({ providerCallCount: 12, decisionCount: 12, additionalProviderCallCount: 4, totalProviderCallCount: 16 });
    // Both completions are in the record, numbered across the build; neither was refused.
    expect(run.stored?.evidenceTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ iteration: 10, decision: "complete" }),
      expect.objectContaining({ iteration: 12, decision: "complete" })
    ]));
    expect(run.stored?.evidenceTrace?.some((step) => step.resultCode === "bootstrap.cannot_answer_instruction")).toBe(false);
  }, 180_000);
});
