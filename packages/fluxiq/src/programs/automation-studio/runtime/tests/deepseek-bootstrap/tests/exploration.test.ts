// Creating a Flow survives a bad reply, for a caller, through the real adapter.
//
// A runtime recovery already did: a malformed reply or a timeout spends one
// call, the run carries on, and the exploration asks again. Flow creation did
// not. Its exploration propagated the first bad decision and ended, so one
// malformed object from the model ended the whole creation. These cases drive
// the stub harness (`harness.ts`) through bad replies, rejected credentials,
// long explorations and token totals. The answerability cases, on the same
// harness, are in `answerability.test.ts`.

import { describe, expect, it } from "vitest";
import { create, useBootstrapTempRoot } from "./harness.ts";
import { complete, look, LOOK_TOOL_ID, type Reply } from "./replies.ts";

useBootstrapTempRoot();

describe("creating a Flow through an exploration, with no grant", () => {
  it("asks again after a malformed decision, carries on, and creates the Flow", async () => {
    const run = await create({ maxCalls: 6, reply: (call, iteration) => call === 1 ? "malformed" : iteration === 2 ? look(2) : complete() });


    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    // The caller's key paid for all three decisions and the judge's one call, one release per call: the bad reply did not
    // end the build. A Flow the model says is ready is judged (F43, `flow-bootstrap/unfinished-build/phases.ts`), and this
    // judge says yes at once, so it is asked once (`result-verification/verify.ts` asks again only on anything but yes).
    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.judgeRequests).toHaveLength(1);
    expect(run.revealed).toHaveLength(4);
    expect(run.stored?.evidenceTrace?.map((step) => step.decision)).toEqual(["unusable", "tool_call", "complete"]);
    // A bad reply names no tool and carries no content, but it does say what
    // was wrong with it: the stored trace keeps the result code, so a reader of
    // a finished build can tell a malformed reply from a refused step.
    // `toMatchObject`, not `toEqual`: every row now also carries `at`, the
    // moment it was recorded, which is a clock reading and so cannot be
    // asserted exactly. That it is there at all is asserted beside it.
    expect(run.stored?.evidenceTrace?.[0]).toMatchObject({ iteration: 1, decision: "unusable", resultCode: "llm.provider_malformed_response" });
    expect(run.stored?.evidenceTrace?.[0]?.at).toEqual(expect.any(Number));
    expect(run.stored?.evidenceTrace?.[1]).toMatchObject({ iteration: 2, callId: "call.2", toolId: LOOK_TOOL_ID });
    // The judge's call is paid for and counted, but apart from the decisions: never in `providerCallCount`.
    expect(run.stored?.auditEvents[0]?.detail).toMatchObject({ providerCallCount: 3, additionalProviderCallCount: 1, totalProviderCallCount: 4, decisionCount: 3, toolCallCount: 1 });
  }, 60_000);

  // The fake endpoint is entered only after the key was released for the call,
  // so this timeout is deterministically a spent provider call.
  it("asks again after a provider decision reaches its deadline", async () => {
    const run = await create({ maxCalls: 6, reply: (call, iteration) => call === 1 ? "timeout_after_send" : iteration === 2 ? look(2) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    // Three decisions and the judge's one call, each released once.
    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.judgeRequests).toHaveLength(1);
    expect(run.revealed).toHaveLength(4);
    expect(run.stored?.auditEvents[0]?.detail).toMatchObject({ providerCallCount: 3, additionalProviderCallCount: 1, totalProviderCallCount: 4, decisionCount: 3 });
  }, 30_000);

  // **The guard stops this, and until 2026-09-28 it could not.** It used to stop
  // after three, three ended builds that were working, and the answer was to
  // make the guard twenty-four -- which is at or above `maxIterations` on every
  // run anybody makes, because the guard is held to the iterations and a build
  // is given 12, 26 or 48 calls. So this run of eleven identical malformed
  // replies was ended by the *run's call count*, published as "the loop ran
  // out of turns", and no stall could ever be reported as a stall.
  //
  // **What ends it now (t211, with t208's lifecycle and t214's record).** A
  // reply that cannot be read is never a bare ending: each is asked again with
  // a note of what could not be read, and only an unbroken run of six
  // (`AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW`,
  // `runtime/llm/unreadable-reply.ts`) ends the build -- before the eight of the
  // no-progress guard, with six of the twelve calls unspent. It ends as exactly
  // that, `flow_bootstrap.model_replies_unreadable`, with a message the person
  // reads saying what happened and how many tries it took: not "not doable",
  // since nothing says the task cannot be done, and not a budget, since the
  // budget had room left. Retryable: the replies were the provider's fault, not
  // the task's.
  it("ends six unreadable replies in a row as exactly that while the run still has calls, with a named outcome", async () => {
    const run = await create({ maxCalls: 12, reply: () => "malformed" });

    expect(run.sentIterations).toEqual([1, 2, 3, 4, 5, 6]);
    expect(run.revealed).toHaveLength(6);
    expect(run.failure).toMatchObject({
      code: "flow_bootstrap.model_replies_unreadable",
      stage: "provider_output_validation",
      retryable: true,
      providerInvocation: "attempted",
      providerResponse: "received",
      // Every malformed reply was paid for, and the record says what it cost:
      // six calls at 1,200 in and 150 out. It used to say nothing -- zero
      // tokens after eight paid calls -- and `run-munw7ffn-fe1cecd2`'s
      // re-author left 14 such calls out of its accounting that way
      // (`runtime/llm/reply-account.ts`).
      accounting: expect.objectContaining({ provider: "deepseek", model: "deepseek-flash", inputTokens: 7_200, outputTokens: 900, totalTokens: 8_100 }),
      // One step per decision, each naming the iteration that paid for it --
      // which is the whole point: six refusals reading the same code are told
      // apart by nothing else. The record is every round's, numbered across the
      // build (t214); this build had one. An unreadable round's rows were left
      // out of it when t211 and t214 first met, which published six paid calls
      // with no steps and a decision count of 0.
      // `at` rides on every step now, a clock reading rather than a value, so
      // the steps are matched on what they say and their moment is asserted
      // as being present at all.
      evidenceLoop: {
        iterationCount: 6, decisionCount: 6, toolCallCount: 0, evidenceBytes: expect.any(Number),
        // Each says which malformed case it was: this script's reply stops
        // inside its object.
        steps: Array.from({ length: 6 }, (_, index) => ({ toolId: "core.decision_unusable", iteration: index + 1, resultCode: "llm.provider_malformed_response", resultReason: "content_unclosed", usage: expect.objectContaining({ inputTokens: 1_200, outputTokens: 150 }), at: expect.any(Number) }))
      },
      issueCodes: ["llm.provider_malformed_response"],
      ending: {
        kind: "replies_unreadable",
        notDone: [],
        tried: { rounds: 1, decisions: 6, stepsInFlow: 0, tested: "not_tested" }
      }
    });
    expect(run.failure?.evidenceLoop?.steps).toHaveLength(6);
    expect(run.failure?.ending).not.toHaveProperty("bound");
    expect(run.failure?.ending?.message).toBe("The build stopped because the model's replies could not be read: 6 in a row came back unreadable -- because the JSON object never closed: it stopped part-way through -- and each was asked again with a note of what was wrong. In all, 6 of 6 replies could not be read, over one live round; each was paid for and counted in the build's budget. No step I found belonged in the Flow. Nothing was kept to carry on from.");
    // Nothing ran out: the round was ended by its unreadable replies, with
    // calls left, so the record carries no exhaustion.
    expect(run.failure?.evidenceLoop).not.toHaveProperty("exhausted");
    expect(run.adaptationCount).toBe(0);
  }, 60_000);

  it("does not count bad replies across a good one", async () => {
    // bad, look, bad, look, bad, bad, complete: never three in a row.
    const script: Reply[] = ["malformed", look(2), "malformed", look(4), "malformed", "malformed", complete()];
    const run = await create({ maxCalls: 8, reply: (call) => script[call - 1]! });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    expect(run.sentIterations).toEqual([1, 2, 3, 4, 5, 6, 7]);
  }, 60_000);

  it("still ends at once when the provider rejects the credential", async () => {
    const run = await create({ maxCalls: 6, reply: () => "unauthorized" });

    expect(run.sentIterations).toEqual([1]);
    expect(run.failure).toMatchObject({ code: "flow_bootstrap.provider_auth_failed", stage: "provider_request", providerInvocation: "attempted" });
    expect(run.adaptationCount).toBe(0);
  }, 60_000);

  // The loop's ceiling rose from sixteen, but the trace kept for a created Flow
  // and the failure diagnostic were still bounded at sixteen: a longer
  // exploration that finished could not be saved, and one that ran out lost its
  // named reason to a generic transport failure.
  it("saves a creation that looked more than sixteen times", async () => {
    const run = await create({ maxCalls: 20, reply: (_call, iteration) => iteration <= 18 ? look(iteration) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.sentIterations).toHaveLength(19);
    expect(run.stored?.evidenceTrace).toHaveLength(19);
    // Nineteen requests' estimates add up past one request's ceiling, which
    // is what the build's accounting used to be held to.
    expect(run.result?.accounting.estimatedInputTokens).toBeGreaterThan(50_000);
  }, 120_000);

  // The build's recorded totals were held to 50,000 -- one request's ceiling --
  // so a build its budget allowed 100,000 tokens failed after using 60,000, with
  // every call already paid for.
  it("records a build's token totals past one request's ceiling when its budget allows them", async () => {
    const run = await create({
      // Nine calls at 22,000 is what lets a run's budget reach 100,000; the whole node catalog in each request
      // (2026-09-30) no longer fits the 12,000 it once was.
      maxCalls: 9,
      tokenLimits: { maxInputTokens: 20_000, maxOutputTokens: 2_000, maxTotalTokens: 22_000 },
      maxTotalTokensPerRun: 100_000,
      billed: { promptTokens: 10_000, completionTokens: 2_000 },
      reply: (_call, iteration) => iteration <= 4 ? look(iteration) : complete()
    });

    expect(run.failure).toBeUndefined();
    expect(run.sentIterations).toHaveLength(5);
    // Five decisions at 10,000 in and 2,000 out, and the judge's one call at 400 and 40: the judge's spend is the build's
    // too (F43), so it is in the totals, though not among the decisions.
    expect(run.judgeRequests).toHaveLength(1);
    expect(run.result?.accounting).toMatchObject({ inputTokens: 50_400, outputTokens: 10_040, totalTokens: 60_440 });
    expect(run.stored?.accounting).toMatchObject({ totalTokens: 60_440 });
  }, 60_000);

  it("names the ending of an exploration that ran out after more than sixteen decisions", async () => {
    const run = await create({ maxCalls: 20, reply: (_call, iteration) => look(iteration) });

    expect(run.sentIterations).toHaveLength(20);
    // Twenty decisions, seventeen tool calls: the eighteenth and nineteenth are
    // the wrap-up and the twentieth the last, none of which offers a tool, so a
    // look asked for on them anyway is not run (t057, `llm/loop-budget.ts`).
    // Since t208 a round out of decisions is not the build's ending: with
    // nothing in its Flow and no call left, the build ends as the call budget
    // it spent, saying so.
    expect(run.failure).toMatchObject({
      code: "flow_bootstrap.evidence_budget_exhausted",
      retryable: true,
      // Twenty decisions paid for, twenty in the record: the last, a look on a
      // decision offered only completion, leaves its row like the rest. It
      // used to leave none, publishing 19 decisions beside 20 paid (t214).
      evidenceLoop: { iterationCount: 20, decisionCount: 20, toolCallCount: 17 },
      ending: { kind: "budget_exhausted", bound: "calls", tried: { rounds: 1, decisions: 20, stepsInFlow: 0 } }
    });
    expect(run.failure?.ending?.message).toMatch(/^The build stopped at its limit of 20 model calls before the Flow was finished\./u);
    expect(run.failure?.evidenceLoop?.steps?.filter((step) => step.resultCode === "llm_evidence_loop.not_offered").map((step) => step.iteration)).toEqual([18, 19, 20]);
    expect(run.failure?.evidenceLoop?.steps?.at(-1)).toMatchObject({ toolId: LOOK_TOOL_ID, iteration: 20, resultCode: "llm_evidence_loop.not_offered", usage: expect.objectContaining({ outputTokens: 150 }) });
  }, 120_000);
});
