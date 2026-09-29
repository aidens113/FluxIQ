import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { verifyAutomationStudioRuntimeSessionResult } from "../run-outcome.ts";
import { ANSWER, UNAVAILABLE, datasetSummary, flow, harness, instruction, runDetail, session, verify } from "./run-outcome-harness.ts";
// The whole path, driven end to end: a run that finished without a failed step,
// its stored records read, one question asked, and the run's own record written
// back.
//
// The defect this proves against is the one measured live on 2026-09-17: a
// request for "members matching hollis who are admins" produced a Flow of
// navigate, extract, end -- no step that narrows anything -- and returned all
// 240 members. Every step succeeded, the run reported `passed`, and the only
// reason anyone noticed is that the test facility held a written answer key.

describe("verifyAutomationStudioRuntimeSessionResult", () => {
  it("fails a succeeded run whose result the model says, twice, does not answer the request", async () => {
    const context = harness({ answer: ANSWER.no });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.verdict).toBe("does_not_answer");
    expect(recorded.status).toBe("refuted");
    expect(recorded.verdicts).toEqual(["does_not_answer", "does_not_answer"]);
    expect(recorded.calls).toBe(2);
    expect(String(recorded.reason)).toContain("not to answer the request");
    expect(String(recorded.observation)).toContain("240 records stored");
    expect(context.requests).toHaveLength(2);
    expect(context.written.at(-1)?.status).toBe("failed");
    expect(context.saved.at(-1)?.summary.status).toBe("failed");
  });

  it("asks a refutation once more with the same evidence, and appends both calls marked as verification", async () => {
    const context = harness({ answer: ANSWER.no });
    await verify(context);
    const [first, second] = context.requests;
    expect(second?.taskKind).toBe("loop_verification");
    expect(second?.context).toEqual(first?.context);
    expect(second?.requestId).not.toBe(first?.requestId);
    const appended = context.saved.at(-1)?.interventions ?? [];
    expect(appended.map((intervention) => intervention.metadata?.source)).toEqual(["verifyAutomationStudioRunResult", "verifyAutomationStudioRunResult"]);
    expect(appended.map((intervention) => intervention.metadata?.verificationCheck)).toEqual([1, 2]);
    expect(new Set(appended.map((intervention) => intervention.interventionId)).size).toBe(2);
  });

  it("leaves a run succeeded and unverified when the second check says the result answers", async () => {
    // Mutation: fail the run on the first no. The session then comes back
    // `failed` on an answer the model did not repeat.
    const context = harness({ answers: [ANSWER.no, ANSWER.yes] });
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded).toMatchObject({ status: "unverified", verdict: "unsure", basis: "model_disagreed", code: "core.result.verdicts_disagree", verdicts: ["does_not_answer", "answers"], calls: 2 });
    expect(context.requests).toHaveLength(2);
    expect(context.saved.at(-1)?.summary.status).toBe("succeeded");
    expect(context.saved.at(-1)?.metadata?.resultVerificationFailure).toBeUndefined();
    expect((context.saved.at(-1)?.metadata?.resultVerification as JsonObject).status).toBe("unverified");
  });

  it("leaves a run succeeded and unverified when the second check cannot answer", async () => {
    for (const second of [ANSWER.unknown, undefined, UNAVAILABLE] as const) {
      const context = harness({ answers: [ANSWER.no, second] });
      const next = await verify(context);
      expect(next.status).toBe("succeeded");
      expect(next.metadata?.resultVerification).toMatchObject({ status: "unverified", basis: "model_unconfirmed", code: "core.result.refutation_unconfirmed", calls: 2 });
      expect(context.saved.at(-1)?.interventions).toHaveLength(2);
    }
  });

  it("asks an unsure answer again, and a yes on the second check leaves the run succeeded and unverified", async () => {
    // Measured live on 2026-09-21: a run that matched 14 of 14 was failed on
    // one `unknown` (run-mublcbqf-9e815106). Mutation: stop asking after an
    // `unknown`. The run then comes back `failed` on one call.
    const context = harness({ answers: [ANSWER.unknown, ANSWER.yes] });
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "unverified", basis: "model_disagreed", code: "core.result.verdicts_disagree", verdicts: ["unsure", "answers"], calls: 2 });
    expect(context.requests).toHaveLength(2);
    expect(context.saved.at(-1)?.interventions.map((intervention) => intervention.metadata?.verificationCheck)).toEqual([1, 2]);
  });

  it("leaves a run succeeded and unverified when two answers never said yes and never agreed on no", async () => {
    // Mutation: refute on any pair without a yes. Each of these runs then
    // comes back `failed`.
    for (const answers of [[ANSWER.unknown, ANSWER.unknown], [ANSWER.unknown, ANSWER.no], [ANSWER.no, ANSWER.unknown]] as const) {
      const context = harness({ answers });
      const next = await verify(context);
      expect(next.status).toBe("succeeded");
      expect(next.metadata?.resultVerification).toMatchObject({ status: "unverified", verdict: "unsure", basis: "model_unconfirmed", code: "core.result.refutation_unconfirmed", calls: 2 });
      expect(context.saved.at(-1)?.metadata?.resultVerificationFailure).toBeUndefined();
    }
  });

  it("fails closed, on one call, when the first call does not come back", async () => {
    // Mutation: ask again after an unavailable first call. A second `yes`
    // would then pass a run on a call that never answered.
    const context = harness({ answers: [UNAVAILABLE, ANSWER.yes] });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "refuted", basis: "model_unavailable", code: "core.result.verdict_unavailable", verdicts: ["unsure"], calls: 1 });
    expect(context.requests).toHaveLength(1);
  });

  it("fails closed, on one call, when the reply never says", async () => {
    // Mutation: treat a reply with no verdict as answering, or ask it again.
    const context = harness({ answer: undefined });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    expect((next.metadata?.resultVerification as JsonObject).code).toBe("core.result.verdict_absent");
    expect(context.requests).toHaveLength(1);
  });

  it("leaves a run that answers alone, and still records that it was judged", async () => {
    const context = harness({ answer: ANSWER.yes });
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    expect(next.metadata?.resultVerification).toMatchObject({ verdict: "answers", verdicts: ["answers"], calls: 1 });
    expect(context.requests).toHaveLength(1);
  });

  it("asks once, as a loop_verification carrying the result summary and the Flow's shape", async () => {
    const context = harness({ answer: ANSWER.yes });
    await verify(context);
    const request = context.requests[0];
    expect(context.requests).toHaveLength(1);
    expect(request?.taskKind).toBe("loop_verification");
    expect(request?.expectedOutput).toBe("diagnosis");
    expect(request?.context.resultSummary?.totalRecordCount).toBe(240);
    expect(request?.context.resultSummary?.flowShape.map((step) => step.definitionId)).toEqual(["builtin.navigate", "builtin.policy.action", "builtin.end"]);
    expect(request?.context.stage).toBeUndefined();
  });

  it("fails a run that stored an empty record set when the model says the empty table does not answer the request", async () => {
    // The single most obviously wrong answer a run can give was, until
    // 2026-09-24, the one case nothing looked at: it was recorded
    // `core.result.no_records`, not checked, and no repair could follow because
    // nothing had refuted it. Mutation: exempt an empty result again -- no
    // request is made, `performed` is false, and every assertion here fails.
    const context = harness({ answer: ANSWER.no, datasets: [datasetSummary({ recordCount: 0 })], instructions: [instruction("List every earbud under $50.")] });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded).toMatchObject({ status: "refuted", performed: true, verdict: "does_not_answer", basis: "model" });
    expect(String(recorded.observation)).toContain("0 records stored");
    expect(context.requests).toHaveLength(2);
    expect(context.saved.at(-1)?.summary.status).toBe("failed");
  });

  it("leaves an empty result succeeded and confirmed where the instruction says an empty table is the right answer", async () => {
    // "If nothing matches, an empty table is the right answer" is a real
    // instruction in this corpus, so the judgement has to be able to conclude
    // satisfied. Mutation: refute an empty result deterministically -- the run
    // comes back `failed` for having correctly found nothing.
    const asked = "List the members matching hollis; if nothing matches, an empty table is the right answer.";
    const context = harness({ answer: ANSWER.yes, datasets: [datasetSummary({ recordCount: 0 })], instructions: [instruction(asked)] });
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "confirmed", performed: true, verdict: "answers", basis: "model", calls: 1 });
    expect(context.requests).toHaveLength(1);
    // The request it was judged against, and the steps that ran, both reached
    // the call: without them nothing could tell "found nothing" from "never
    // looked".
    expect(context.requests[0]?.context.instructions.instructions.map((entry) => entry.body)).toEqual([asked]);
    expect(context.requests[0]?.context.resultSummary?.totalRecordCount).toBe(0);
    expect(context.requests[0]?.context.resultSummary?.flowShape.map((step) => step.definitionId)).toEqual(["builtin.navigate", "builtin.policy.action", "builtin.end"]);
    expect(context.resolutions.count).toBe(1);
  });

  it("hands a refuted empty result to the wrong-answer route exactly as a refuted non-empty one", async () => {
    // The point of judging it: the repair re-enters exploration. Mutation: keep
    // the empty result on a provider-free path -- `performed` is false, the run
    // is not failed, and the repair port is never reached.
    const repairs: number[] = [];
    // The extract step that stored nothing still ran and still succeeded, which
    // is what the repair speaks about: `attempt.ts` takes the last succeeded
    // attempt as the node the result came out of.
    const extracted: AutomationStudioFlowRunDetail = {
      ...runDetail(),
      actionAttempts: [{ attemptId: "attempt.1", nodeId: "n2", definitionId: "builtin.policy.action", order: 1, status: "succeeded", startedAt: 2, finishedAt: 3, metadata: { recordCount: 0 } }]
    };
    const context = harness({ answer: ANSWER.no, datasets: [datasetSummary({ recordCount: 0 })], instructions: [instruction("List every earbud under $50.")] });
    const next = await verify(context, {
      ports: {
        ...context.ports,
        getFlowRunDetail: async () => extracted,
        repairRefutedResult: async (request) => { repairs.push(request.resultSummary.totalRecordCount); return undefined; }
      }
    });
    expect(next.status).toBe("failed");
    // Handed over with the empty result itself, so the repair can see that
    // nothing was stored rather than being told only that the answer was wrong.
    expect(repairs).toEqual([0]);
  });

  it("records Core's fix on the run and hands the judgement's own reading to the wrong-answer route", async () => {
    // Two halves of one rule: Core's findings and fix lines go on the run, and the
    // judgement's prose does not -- it reaches the repair through the failure
    // record, of which the recovery context sends `expected` and `actual` alone.
    const extracted: AutomationStudioFlowRunDetail = {
      ...runDetail(),
      actionAttempts: [{ attemptId: "attempt.1", nodeId: "n2", definitionId: "builtin.policy.action", order: 1, status: "succeeded", startedAt: 2, finishedAt: 3, metadata: { recordCount: 0 } }]
    };
    const entered: (string | undefined)[] = [];
    let structuredAdvice: unknown;
    const advice = `type the search term before extracting ${"specific ".repeat(45)}END-OF-ADVICE`;
    const context = harness({
      answer: ANSWER.no,
      datasets: [datasetSummary({ recordCount: 0 })],
      said: { expected: "the two matching members " + "precisely ".repeat(45), observed: "an empty table", changed: advice }
    });
    const next = await verify(context, {
      ports: {
        ...context.ports,
        getFlowRunDetail: async () => extracted,
        repairRefutedResult: async (request) => {
          entered.push(request.failedTraceAttempt.failure?.expected, request.failedTraceAttempt.failure?.actual);
          const directive = request.failedTraceAttempt.inputs.resultRepair as JsonObject | undefined;
          structuredAdvice = (directive?.judgement as JsonObject | undefined)?.advice;
          return undefined;
        }
      }
    });
    const recorded = (next.metadata?.resultVerification as JsonObject).repair as JsonObject;
    expect((recorded.findings as JsonObject[]).map((finding) => finding.code)).toContain("result.no_records_stored");
    expect(String((recorded.fix as string[])[0])).toContain("loosen every condition");
    expect(recorded.judgement).toBeUndefined();
    expect(JSON.stringify(next.metadata)).not.toContain("the two matching members");
    expect(entered[0]).toContain("the two matching members");
    expect(entered[0]).toContain("To fix:");
    expect(entered[0]).not.toContain("END-OF-ADVICE");
    expect(structuredAdvice).toBe(advice);
    expect(entered[1]).toContain("0 records stored");
    expect(entered[1]).toContain("an empty table");
  });

  it("carries each step's authored parameters to the judgement, screened", async () => {
    // The parity gap: the repair has been shown this projection since t139.
    const withParameters: AutomationStudioFlowDocument = {
      ...flow,
      nodes: [
        { id: "n1", definitionId: "builtin.navigate", label: "Open the directory", parameterValues: { url: "https://members.test/list?team=ops" } },
        { id: "n2", definitionId: "builtin.policy.action", parameterValues: { maxRows: 25, secret: "hunter2" } }
      ]
    };
    const context = harness({ answer: ANSWER.yes });
    await verify(context, { flow: withParameters, session: session({ flow: withParameters }) });
    const shape = context.requests[0]?.context.resultSummary?.flowShape ?? [];
    expect(shape[0]?.label).toBe("Open the directory");
    expect(shape[0]?.parameters).toEqual({ url: "https://members.test" });
    expect(shape[1]?.parameters).toEqual({ maxRows: 25, secret: null });
    expect(shape[1]?.parametersWithheld).toEqual(["secret"]);
    expect(JSON.stringify(context.requests[0]?.context)).not.toContain("hunter2");
    expect(JSON.stringify(context.requests[0]?.context)).not.toContain("team=ops");
  });

  it("fails a run whose every row was refused, without spending a call", async () => {
    // Mutation: ignore validation refusals when every row was refused. The code
    // becomes `no_records` and this fails.
    const context = harness({ answer: ANSWER.yes, datasets: [datasetSummary({ recordCount: 0, invalidCount: 5 })] });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    expect((next.metadata?.resultVerification as JsonObject).code).toBe("core.result.every_record_refused");
    expect(context.requests).toHaveLength(0);
    // Not a provider resolution either: a schema that refused every row it found
    // is wrong under any request, so nothing about it is worth resolving a model
    // for. Mutation: judge every result through the model, and this fails.
    expect(context.resolutions.count).toBe(0);
  });

  it("records that nothing was judged, rather than a pass, when no model can be asked", async () => {
    const context = harness({ withProvider: false });
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.performed).toBe(false);
    expect(recorded.verdict).toBeUndefined();
    expect(recorded.code).toBe("core.result.no_model_available");
  });

  it("judges a run that stored no record set at all on what it did, rather than exempting it", async () => {
    // An action-only Flow -- it signed in, or pressed something. Mutation:
    // restore `nothing_to_judge`: no call is made, `performed` is false, and a
    // run that never did what was asked reports success unchallenged.
    const context = harness({ answer: ANSWER.no, datasetsUnavailable: true, instructions: [instruction("Cancel the 4pm booking.")] });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "refuted", performed: true, verdict: "does_not_answer" });
    expect(context.requests).toHaveLength(2);
    expect(context.requests[0]?.context.resultSummary?.recordSetCount).toBe(0);
  });

  it("confirms a run that stored no record set when the model judges the request was carried out", async () => {
    const context = harness({ answer: ANSWER.yes, datasetsUnavailable: true, instructions: [instruction("Cancel the 4pm booking.")] });
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    expect(next.metadata?.resultVerification).toMatchObject({ status: "confirmed", performed: true, verdict: "answers", calls: 1 });
  });

  it("ends a verification whose provider resolution never returns, instead of hanging the run", async () => {
    // The 2026-09-20 hang (t024), which was never root-caused and was worked
    // around by never resolving a provider for an empty result. Bounded now:
    // the run ends, says the check did not finish, and keeps the status its
    // steps earned. Mutation: drop the deadline, and this test never returns.
    const context = harness({ resolverHangs: true, datasets: [datasetSummary({ recordCount: 0 })] });
    const next = await verify(context, { verificationDeadlineMs: 20 });
    expect(next.status).toBe("succeeded");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded).toMatchObject({ status: "unverified", performed: false, code: "core.result.verification_did_not_finish" });
    expect(String(recorded.reason)).toContain("did not finish inside its deadline");
    expect(context.requests).toHaveLength(0);
    expect(context.saved.at(-1)?.summary.status).toBe("succeeded");
  });

  it("ends a verification whose provider resolution throws, naming the error's kind and not its message", async () => {
    const context = harness({ datasets: [datasetSummary({ recordCount: 0 })] });
    const next = await verify(context, { ports: { ...context.ports, resolveProvider: async () => { throw new Error("SQLITE_CANTOPEN /projects/project-1/project.sqlite"); } } });
    expect(next.status).toBe("succeeded");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.code).toBe("core.result.verification_did_not_finish");
    expect(String(recorded.reason)).toContain("(Error)");
    expect(String(recorded.reason)).not.toContain("SQLITE_CANTOPEN");
  });

  it("abandons a verification when the run itself is cancelled under it", async () => {
    const context = harness({ resolverHangs: true, datasets: [datasetSummary({ recordCount: 0 })] });
    const controller = new AbortController();
    const running = verify(context, { signal: controller.signal, verificationDeadlineMs: 60_000 });
    controller.abort();
    const next = await running;
    expect(next.status).toBe("succeeded");
    expect(String((next.metadata?.resultVerification as JsonObject).reason)).toContain("cancelled while it was being judged");
  });

  it("fails closed, naming the error's kind and not its message, when the result cannot be read", async () => {
    const context = harness({ listThrows: true, answer: ANSWER.yes });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.code).toBe("core.result.unreadable");
    expect(String(recorded.observation)).not.toContain("SQLITE_CANTOPEN");
    expect(context.requests).toHaveLength(0);
  });

  it("fails a run whose stored rows leave a required field empty, without spending a call", async () => {
    // Measured live on 2026-09-18: rows came back with required fields empty
    // and the run reported `passed`. Mutation: let a row missing a required
    // value through the free check -- the model is then asked, answers `yes`,
    // and the session comes back `succeeded`.
    const homes: AutomationStudioRecordSchema = {
      schemaVersion: "0.1",
      fields: [{ id: "address", label: "Address", valueType: "string", required: true }, { id: "price", label: "Price", valueType: "string", required: true }]
    };
    const rows = Array.from({ length: 10 }, (_row, index) => ({ address: `${index} Kelford Row`, price: index === 0 ? "£410,000" : "" }));
    const context = harness({ answer: ANSWER.yes, schema: homes, rows, datasets: [datasetSummary({ datasetId: "homes", recordCount: 10 })] });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.code).toBe("core.result.required_values_missing");
    expect(recorded.basis).toBe("core_observation");
    expect(recorded.status).toBe("refuted");
    expect(String(recorded.observation)).toBe("9 of 10 rows checked, of 10 stored, have no value for a required field (price).");
    expect(context.requests).toHaveLength(0);
    expect(context.saved.at(-1)?.metadata?.resultVerificationFailure).toEqual({ category: "output_not_observed", code: "core.result.required_values_missing" });
  });

  it("reads a full page of rows to check, and still shows the model only a few", async () => {
    const pageLimits: unknown[] = [];
    const rows = Array.from({ length: 30 }, (_row, index) => ({ name: `Hollis ${index}`, role: "admin" }));
    const context = harness({ answer: ANSWER.yes, rows, pageLimits });
    await verify(context);
    expect(pageLimits).toEqual([200]);
    const sent = context.requests[0]?.context.resultSummary?.recordSets[0];
    expect(sent?.rowsChecked).toBe(30);
    expect(sent?.sampleRows?.length).toBeLessThanOrEqual(4);
  });

  it("records a result nobody judged as unverified, never as confirmed", async () => {
    // Mutation: read a skipped verification as a pass. `status` then says
    // `confirmed` for a result no model saw, and this fails.
    const next = await verify(harness({ withProvider: false }));
    expect(next.status).toBe("succeeded");
    expect((next.metadata?.resultVerification as JsonObject).status).toBe("unverified");
  });

  it("records a judged result as confirmed or refuted, and a run nobody could judge as unverified", async () => {
    // `no_result` is gone from the vocabulary a new run can reach: a run that
    // stored no record set is judged on what it did, and the two remaining ways
    // of not judging one both read `unverified`.
    expect(((await verify(harness({ answer: ANSWER.yes }))).metadata?.resultVerification as JsonObject).status).toBe("confirmed");
    expect(((await verify(harness({ answer: ANSWER.no }))).metadata?.resultVerification as JsonObject).status).toBe("refuted");
    expect(((await verify(harness({ answer: ANSWER.unknown }))).metadata?.resultVerification as JsonObject).status).toBe("unverified");
    expect(((await verify(harness({ datasetsUnavailable: true, answer: ANSWER.yes }))).metadata?.resultVerification as JsonObject).status).toBe("confirmed");
    expect(((await verify(harness({ withProvider: false }))).metadata?.resultVerification as JsonObject).status).toBe("unverified");
  });

  it("writes the same status onto the run detail a reader of the run sees", async () => {
    const context = harness({ withProvider: false });
    await verify(context);
    expect((context.saved.at(-1)?.metadata?.resultVerification as JsonObject).status).toBe("unverified");
  });

  it("leaves a run that already failed alone, and asks nothing", async () => {
    const context = harness({ answer: ANSWER.no });
    const next = await verify(context, { session: session({ status: "failed" }) });
    expect(next.status).toBe("failed");
    expect(next.metadata?.resultVerification).toBeUndefined();
    expect(context.written).toHaveLength(0);
    expect(context.requests).toHaveLength(0);
  });
});

// What the checking schedule leaves on a run and why the run store keys its
// `result_verification_status` column on it.
describe("the checking schedule's decision on the run record", () => {
  const scheduled = (checked: boolean, code: string) => ({ resultCheck: { checked, epoch: 4, code, reason: "Run 8 is the next one this Flow's schedule checks." } });

  it("marks a checked run as checked, with its epoch and the verdict beside the decision", async () => {
    const context = harness({ answer: ANSWER.yes });
    const next = await verify(context, scheduled(true, "core.check.interval_reached"));
    expect(next.metadata?.resultCheck).toEqual({ checked: true, epoch: 4, code: "core.check.interval_reached", reason: expect.any(String), status: "confirmed" });
    // The summary carries it too: that is what `upsertRunSummary` writes the row from.
    expect(context.saved.at(-1)?.summary.metadata?.resultCheck).toMatchObject({ checked: true, epoch: 4, status: "confirmed" });
    expect(context.saved.at(-1)?.metadata?.resultCheck).toMatchObject({ checked: true, status: "confirmed" });
  });

  it("marks a run the schedule passed over as unchecked, so its unverified is not counted as a check", async () => {
    const context = harness({ withProvider: false });
    const next = await verify(context, scheduled(false, "core.check.interval_not_reached"));
    // The verification still ran and still recorded `unverified`; what changes
    // is that the run says it was never put to the question.
    expect((next.metadata?.resultVerification as JsonObject).status).toBe("unverified");
    expect(next.metadata?.resultCheck).toMatchObject({ checked: false, code: "core.check.interval_not_reached", status: "unverified" });
    expect(context.saved.at(-1)?.summary.metadata?.resultCheck).toMatchObject({ checked: false, status: "unverified" });
  });

  it("records a refutation as a checked run that refuted, which is what opens the repair entry", async () => {
    const next = await verify(harness({ answer: ANSWER.no }), scheduled(true, "core.check.initial_window"));
    expect(next.status).toBe("failed");
    expect(next.metadata?.resultCheck).toMatchObject({ checked: true, status: "refuted" });
  });

  it("leaves a caller with no schedule exactly as it was, with nothing added", async () => {
    const context = harness({ answer: ANSWER.yes });
    const next = await verify(context);
    expect(next.metadata?.resultCheck).toBeUndefined();
    expect(context.saved.at(-1)?.summary.metadata?.resultCheck).toBeUndefined();
  });
});

describe("the version a verdict was about", () => {
  /** A run that carries the version set its session recorded: the orchestration Flow and the Subflow graph the router entered. */
  const versioned = (versions: readonly { graphFlowId: string; revision: number | null; subflowId?: string }[]) => session({ metadata: { flowVersions: versions.map((version) => ({ ...version })) } });

  it("binds the verdict to every version the run executed, and says which question it was judged against", async () => {
    const context = harness({ answer: ANSWER.no, instructions: [instruction("List the admins matching hollis.")] });
    await verifyAutomationStudioRuntimeSessionResult({
      ports: context.ports,
      projectId: "project-1",
      flow,
      session: versioned([{ graphFlowId: "flow-1", revision: 4 }, { graphFlowId: "flow-1.sub.graph", revision: 2, subflowId: "sub-1" }])
    });
    expect(context.judgements).toHaveLength(1);
    const judgement = context.judgements[0]!;
    expect(judgement.runId).toBe("run-1");
    expect(judgement.status).toBe("refuted");
    expect(judgement.code).toBeTruthy();
    expect(judgement.versions).toEqual([{ graphFlowId: "flow-1", revision: 4 }, { graphFlowId: "flow-1.sub.graph", revision: 2, subflowId: "sub-1" }]);
    expect(judgement.instructionDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("carries the version set into the run detail, beside the verdict", async () => {
    const context = harness({ answer: ANSWER.yes, instructions: [instruction("List the admins.")] });
    const next = await verifyAutomationStudioRuntimeSessionResult({
      ports: context.ports,
      projectId: "project-1",
      flow,
      session: versioned([{ graphFlowId: "flow-1", revision: 4 }])
    });
    expect(next.status).toBe("succeeded");
    const metadata = context.saved.at(-1)?.metadata ?? {};
    expect(metadata.flowVersions).toEqual([{ graphFlowId: "flow-1", revision: 4 }]);
    expect((metadata.resultVerification as JsonObject).status).toBe("confirmed");
    expect(context.judgements[0]?.status).toBe("confirmed");
  });

  // A Flow whose graph was never indexed has no chain. The run still says so --
  // a reader can see which graph ran and that it has no version -- but nothing
  // is written to a history keyed on a revision number, because absent is not
  // zero and a row claiming version 0 would invent a predecessor.
  it("records a Flow with no revision chain on the run, and writes it no judgement", async () => {
    const context = harness({ answer: ANSWER.yes, instructions: [instruction("List the admins.")] });
    await verifyAutomationStudioRuntimeSessionResult({
      ports: context.ports,
      projectId: "project-1",
      flow,
      session: versioned([{ graphFlowId: "flow-1", revision: null }])
    });
    expect(context.saved.at(-1)?.metadata?.flowVersions).toEqual([{ graphFlowId: "flow-1", revision: null }]);
    expect(context.judgements).toHaveLength(0);
  });

  it("writes no judgement for a run that recorded no version at all", async () => {
    const context = harness({ answer: ANSWER.yes, instructions: [instruction("List the admins.")] });
    await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow });
    expect(context.judgements).toHaveLength(0);
    expect(context.saved.at(-1)?.metadata?.flowVersions).toBeUndefined();
  });

  // A deployment with no project database has nowhere to keep a history. The
  // run still names the version it ran, so which version a result belongs to
  // stays answerable; only the comparison across runs is absent.
  it("still records the version set on the run where there is no store for the history", async () => {
    const context = harness({ answer: ANSWER.yes, noJudgementStore: true, instructions: [instruction("List the admins.")] });
    await verifyAutomationStudioRuntimeSessionResult({
      ports: context.ports,
      projectId: "project-1",
      flow,
      session: versioned([{ graphFlowId: "flow-1", revision: 4 }])
    });
    expect(context.saved.at(-1)?.metadata?.flowVersions).toEqual([{ graphFlowId: "flow-1", revision: 4 }]);
    expect(context.judgements).toHaveLength(0);
  });

  // Core settled this one from its own arithmetic -- every stored row refused --
  // so no model was asked and no instruction was read. The question is recorded
  // as unknown rather than as the digest of an empty one, which would make
  // every such run look like the same question as every other.
  it("records an unknown question as null where Core settled the verdict itself", async () => {
    const context = harness({ datasets: [datasetSummary({ recordCount: 0, invalidCount: 5 })], instructions: [instruction("List the admins.")] });
    await verifyAutomationStudioRuntimeSessionResult({
      ports: context.ports,
      projectId: "project-1",
      flow,
      session: versioned([{ graphFlowId: "flow-1", revision: 4 }])
    });
    expect(context.resolutions.count).toBe(0);
    expect(context.judgements).toHaveLength(1);
    expect(context.judgements[0]?.instructionDigest).toBeNull();
    expect(context.judgements[0]?.status).toBe("refuted");
  });
});
