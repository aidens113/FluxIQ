// @fluxiq-test-group real-sql
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
import { complete, look, lookAdded, LOOK_TOOL_ID, type Reply } from "./replies.ts";

useBootstrapTempRoot();

describe("creating a Flow through an exploration, with no grant", () => {
  it("asks again after a malformed decision, carries on, and creates the Flow", async () => {
    const run = await create({ maxCalls: 6, looksAreSteps: true, reply: (call, iteration) => call === 1 ? "malformed" : iteration === 2 ? lookAdded(2) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    // The caller's key paid for all three decisions and the judge's two calls, one release per call: the bad reply did not
    // end the build. A Flow the model says is ready is judged (F43, `flow-bootstrap/unfinished-build/phases.ts`), and a
    // yes that would finish a build is asked once more with the same evidence before it stands (t194-w71, live run
    // murwcmx2: one lone yes finished a build its other judges refuted; `result-verification/verify.ts` `confirmAnswer`).
    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.judgeRequests).toHaveLength(2);
    // What it judged is the test of the whole Flow, which ran the one step added (t244), both times.
    expect(run.judgeRequests.map((request) => request.stepCount)).toEqual([1, 1]);
    expect(run.revealed).toHaveLength(5);
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
    expect(run.stored?.auditEvents[0]?.detail).toMatchObject({ providerCallCount: 3, additionalProviderCallCount: 2, totalProviderCallCount: 5, decisionCount: 3, toolCallCount: 1 });
  }, 60_000);

  // The fake endpoint is entered only after the key was released for the call,
  // so this timeout is deterministically a spent provider call.
  it("asks again after a provider decision reaches its deadline", async () => {
    const run = await create({ maxCalls: 6, looksAreSteps: true, reply: (call, iteration) => call === 1 ? "timeout_after_send" : iteration === 2 ? lookAdded(2) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    // Three decisions and the judge's two calls (a finishing yes is confirmed, t194-w71), each released once.
    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.judgeRequests).toHaveLength(2);
    expect(run.revealed).toHaveLength(5);
    expect(run.stored?.auditEvents[0]?.detail).toMatchObject({ providerCallCount: 3, additionalProviderCallCount: 2, totalProviderCallCount: 5, decisionCount: 3 });
  }, 30_000);

  // Six unreadable replies in a row once ended a build with calls left (`flow_bootstrap.model_replies_unreadable`). No
  // count of unreadable replies ends one now (t1056): each, paid for, is asked again with its note. The same unreadable
  // reply again is a repeat loop detection catches, and at the top of its ladder the build's round ends (`loopSignal`);
  // the build opens a fresh round, as it does for any round that stalled. No count of rounds ends it either (t1056; it
  // was six): its budget does. Here that is the harness's 360,000 tokens (30,000 a call for 12 calls,
  // `./harness.ts`). Each malformed reply bills 1,200 input and 150 output tokens, so 228 of them over 39 rounds
  // spend 307,800, and the 52,200 left cannot hold the next request's input and reply allowance.
  it("asks again after every unreadable reply, each paid for, round after round, until its token budget ends it", async () => {
    const run = await create({ maxCalls: 12, reply: () => "malformed" });

    const n = run.sentIterations.length;
    expect(n).toBe(228);
    expect(run.failure).toMatchObject({
      code: "flow_bootstrap.evidence_budget_exhausted",
      retryable: true,
      providerInvocation: "attempted",
      totalProviderCallCount: 228,
      accounting: { inputTokens: 1_200 * 228, outputTokens: 150 * 228, totalTokens: 1_350 * 228 },
      evidenceLoop: { decisionCount: n, toolCallCount: 0, exhausted: { bound: "budget", budgetBound: "tokens" } },
      ending: { kind: "budget_exhausted", bound: "tokens", tried: { rounds: 39, decisions: n, stepsInFlow: 0 } }
    });
    expect(run.failure?.ending?.message).toMatch(/^The build stopped at its budget of 360000 tokens before the Flow was finished\./u);
    // Every malformed reply was paid for and counted (`runtime/llm/reply-account.ts`).
    expect(run.failure?.accounting?.inputTokens).toBeGreaterThanOrEqual(1_200 * n);
    expect(run.failure?.evidenceLoop?.steps?.filter((step) => step.toolId === "core.decision_unusable" && step.resultCode === "llm.provider_malformed_response").length).toBeGreaterThan(6);
    expect(run.adaptationCount).toBe(0);
  }, 120_000);

  it("does not count bad replies across a good one", async () => {
    // bad, look, bad, look, bad, bad, complete: never three in a row.
    const script: Reply[] = ["malformed", lookAdded(2), "malformed", look(4), "malformed", "malformed", complete()];
    const run = await create({ maxCalls: 8, looksAreSteps: true, reply: (call) => script[call - 1]! });

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
    const run = await create({ maxCalls: 20, looksAreSteps: true, reply: (_call, iteration) => iteration === 1 ? lookAdded(1) : iteration <= 18 ? look(iteration) : complete() });

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
      // Nine calls at 22,000 is what lets a run's budget reach 100,000: what matters here is only that the build's
      // 60,880 is past one request's window while the run's budget allows it. The window counts what is sent, never
      // the whole node catalog the packed request carries beside it (t748): counted, it grew whenever a node gained a
      // parameter, and write-records' records parameter (t738) pushed this window 35 tokens over. The product's own
      // window is 1,000,000; this is the test's, not a product ceiling.
      maxCalls: 9,
      looksAreSteps: true,
      tokenLimits: { maxInputTokens: 20_000, maxOutputTokens: 2_000, maxTotalTokens: 22_000 },
      maxTotalTokensPerRun: 100_000,
      billed: { promptTokens: 10_000, completionTokens: 2_000 },
      reply: (_call, iteration) => iteration === 1 ? lookAdded(1) : iteration <= 4 ? look(iteration) : complete()
    });

    expect(run.failure).toBeUndefined();
    expect(run.sentIterations).toHaveLength(5);
    // Five decisions at 10,000 in and 2,000 out, and the judge's two calls at 400 and 40 each (a finishing yes is
    // confirmed, t194-w71): the judge's spend is the build's too (F43), so it is in the totals, though not among the decisions.
    expect(run.judgeRequests).toHaveLength(2);
    expect(run.result?.accounting).toMatchObject({ inputTokens: 50_800, outputTokens: 10_080, totalTokens: 60_880 });
    expect(run.stored?.accounting).toMatchObject({ totalTokens: 60_880 });
  }, 60_000);

  // A build that only looks is no longer stopped by a count of calls (t1056): it looks until the run's budget -- here its
  // tokens -- is spent, and its ending names that budget.
  it("names the ending of an exploration that ran out after more than sixteen decisions", async () => {
    const run = await create({ maxCalls: 20, reply: (_call, iteration) => look(iteration) });

    const n = run.sentIterations.length;
    expect(n).toBeGreaterThan(20);
    expect(run.failure).toMatchObject({
      code: "flow_bootstrap.evidence_budget_exhausted",
      retryable: true,
      evidenceLoop: { iterationCount: n, decisionCount: n },
      ending: { kind: "budget_exhausted", bound: "tokens", tried: { rounds: 1, decisions: n, stepsInFlow: 0 } }
    });
    expect(run.failure?.ending?.message).toMatch(/^The build stopped at its budget of \d+ tokens before the Flow was finished\./u);
    // Its last decisions are the wrap-up, which offers no tool: a look asked for on them is not run (t057).
    expect(run.failure?.evidenceLoop?.steps?.at(-1)).toMatchObject({ toolId: LOOK_TOOL_ID, iteration: n, resultCode: "llm_evidence_loop.not_offered" });
  }, 120_000);
});
