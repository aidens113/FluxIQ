// A stub-judge replay of run `run-mvud43a2-445c7f17`'s shape (t810, framework
// plan P5b) through the verification (`../../../verify.ts`): a Flow stored
// exactly the rows asked for, and every judge said no, naming only left-out
// rows Core's own record of each row refutes -- items the client marked outside
// the person's set, and a row given a value its own cell does not hold. Such a
// no is asked once more with Core's evidence, the rows reversed and the
// converse question; a no still naming only such rows is not a no, and the
// result answers. On the made-up reading-circle board of
// `../../../located-defects/tests/circle-board-fixture.ts`. The computed facts
// are stubbed (`../../computed-facts-route/`). No model is called.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmFlowPurseScope } from "../../../../llm/build-purse/index.ts";
import { automationStudioResultComputedFacts } from "../../../computed-facts/index.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultComputedFact } from "../../../contracts/index.ts";
import { ANY_CIRCLE, CIRCLE_YES, NOT_ENTERED, OWN_CIRCLES, RECAST_NO, REFUTED_DEFECTS, REFUTED_NO, circleInstruction, circleRunSummary, citingYes } from "../../../located-defects/tests/circle-board-fixture.ts";
import { INVENTED_CLUB_NO, noticeInstruction, noticeRunSummary } from "../../../located-defects/tests/club-notices-fixture.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../../../verdict/index.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

vi.mock("../../../computed-facts/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../computed-facts/index.ts")>()),
  automationStudioResultComputedFacts: vi.fn(() => [])
}));
const computed = vi.mocked(automationStudioResultComputedFacts);
beforeEach(() => {
  computed.mockReset();
  computed.mockReturnValue([]);
});

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A provider answering each call with its own diagnosis, keeping every request it was sent. */
function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        const diagnosis = diagnoses[seen.length];
        seen.push(request);
        if (!diagnosis) throw new Error("no call scripted");
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const verify = (provider: AutomationStudioLlmProvider, summary = circleRunSummary()) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary, instructions: [circleInstruction()], deniedEvidenceKeys: [], provider });

/** The recheck a request carried, as the judge's copy of the summary holds it. */
const recheckOf = (request: AutomationStudioLlmTaskRequest | undefined): string => String(request?.context.resultSummary?.recheck ?? "");
/** The whole judge's copy a request carried, to tell two asks apart. */
const copyOf = (request: AutomationStudioLlmTaskRequest | undefined): string => JSON.stringify(request?.context.resultSummary ?? {});

/** A no naming the case's rows with other request words: one quote negated, or naming no person. */
const noQuoting = (requestWords: string) => ({ ...REFUTED_NO, defects: REFUTED_NO.defects.map((defect) => (defect.row.startsWith("Ann Lee") ? defect : { ...defect, requestWords })) });

describe("a no whose every defect row Core's record of that row refutes, through the verification (t810)", () => {
  it("(a, d) asks each no once more with Core's evidence, reversed and conversely; the same no again leaves no no standing: answers", async () => {
    const { provider, seen } = answering(REFUTED_NO, REFUTED_NO, REFUTED_NO, REFUTED_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    const outcome = report.outcome;
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "answers", basis: "model", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.noRefutedByRecord, verdicts: ["does_not_answer", "does_not_answer", "does_not_answer", "does_not_answer"], calls: 4 });
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
    expect(outcome.repair).toBeUndefined();
    expect(outcome.unsupportedNo).toBeUndefined();
    expect(outcome.refutedRows).toEqual(expect.arrayContaining([
      { call: 1, row: REFUTED_DEFECTS[0].row, kind: "asked_missing", evidence: "cell_differs", quote: "circle: \"Ann Lee\"" },
      { call: 1, row: REFUTED_DEFECTS[1].row, kind: "asked_missing", evidence: "outside_mark", quote: "\"Reserve a place\" for \"Garden Readers\"" },
      { call: 2, row: REFUTED_DEFECTS[2].row, kind: "asked_missing", evidence: "outside_mark", quote: "\"Reserve a place\" for \"Cycle Readers\"" }
    ]));
    expect(outcome.refutedRows).toHaveLength(6);
    for (const reask of [seen[2], seen[3]]) {
      const words = recheckOf(reask);
      expect(words).toContain("start from those rows, not from the request");
      expect(words).toContain("its item showed the person \"Reserve a place\" for \"Garden Readers\"");
      expect(words).toContain("its own cell is circle: \"Ann Lee\", not \"Town Archive Society\"");
      // The rows in the reverse of the order the no gave them.
      const at = (row: string) => words.indexOf(`"${row}`);
      expect(at("Rui Tan")).toBeLessThan(at("Kai Moss"));
      expect(at("Kai Moss")).toBeLessThan(at("Ann Lee"));
      // Core's words name no site, kind of set or offer before the rows.
      expect(words.split("Core's record of those rows:")[0]).not.toMatch(/\b(?:circle|reserve|group|join|member|social|library|notice)\w*/iu);
      // (d) never byte-identical to an earlier ask.
      expect(copyOf(reask)).not.toBe(copyOf(seen[0]));
      expect(copyOf(reask)).not.toBe(copyOf(seen[1]));
    }
    expect(recheckOf(seen[0])).toBe("");
    expect(report.interventions.slice(2).map((intervention) => intervention.metadata)).toEqual([
      expect.objectContaining({ verificationCheck: 1, verificationReask: true }),
      expect.objectContaining({ verificationCheck: 2, verificationReask: true })
    ]);
  });

  it("(b) takes a re-ask's yes beside a no still wholly refuted: answers, the yes's own", async () => {
    const { provider, seen } = answering(REFUTED_NO, REFUTED_NO, CIRCLE_YES, REFUTED_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    const outcome = report.outcome;
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "answers", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answers, calls: 4 });
    expect(outcome.refutedRows?.length).toBeGreaterThan(0);
    // Nothing of the refuted nos is carried on as advice.
    expect(outcome.answeredReading?.advice).toBeUndefined();
  });

  it("(b) takes two re-ask yeses: answers", async () => {
    const { provider } = answering(REFUTED_NO, REFUTED_NO, CIRCLE_YES, CIRCLE_YES);
    const report = await verify(provider);
    expect(report.outcome).toMatchObject({ verdict: "answers", calls: 4 });
  });

  it("weighs a re-ask no naming a defect Core finds as before: the no stands", async () => {
    const located = { ...REFUTED_NO, defects: [{ kind: "kept_not_asked", row: "Map Readers", requestWords: OWN_CIRCLES }] };
    const { provider, seen } = answering(REFUTED_NO, REFUTED_NO, located, REFUTED_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    if (!report.outcome.performed) throw new Error("not performed");
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer" });
    expect(automationStudioResultVerificationFailsRun(report.outcome)).toBe(true);
    // The rows Core refuted stay on the outcome, though the no stands (follow-up 2).
    expect(report.outcome.performed && report.outcome.refutedRows?.length).toBeGreaterThan(0);
  });

  it("is unsure, as before, where a re-ask did not come back usable", async () => {
    const { provider, seen } = answering(REFUTED_NO, REFUTED_NO, REFUTED_NO);
    const report = await verify(provider);
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(report.outcome).toMatchObject({ verdict: "unsure" });
    expect(report.outcome.performed && report.outcome.code).not.toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.noRefutedByRecord);
  });

  it("cannot accept refuted nos when the real Flow purse is exhausted before the mandatory evidence calls", async () => {
    const { provider, seen } = answering(REFUTED_NO, REFUTED_NO, REFUTED_NO, REFUTED_NO);
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.002 });
    const report = await automationStudioLlmFlowPurseScope(purse, async () => await verify(provider));
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "unsure" });
    expect(report.outcome.performed && report.outcome.code).not.toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.noRefutedByRecord);
  });

  it("(c) asks nothing more of a no naming one row Core finds: the no stands", async () => {
    const withLocated = { ...REFUTED_NO, defects: [...REFUTED_NO.defects, { kind: "kept_not_asked", row: "Map Readers", requestWords: OWN_CIRCLES }] };
    const { provider, seen } = answering(withLocated, withLocated);
    const report = await verify(provider);
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
  });

  it("(c) asks the generic recheck of a no with one row Core neither finds nor refutes, and never answers on it", async () => {
    const unrefuted = { ...REFUTED_NO, defects: [...REFUTED_NO.defects, { kind: "asked_missing", row: "Kai Moss", column: "circle", value: "Garden Readers", requestWords: "every circle notice on the board" }] };
    const { provider, seen } = answering(unrefuted, unrefuted, unrefuted, unrefuted);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    expect(recheckOf(seen[2])).toContain("named no defect Core can find in this result");
    expect(recheckOf(seen[2])).not.toContain("start from those rows");
    expect(report.outcome).toMatchObject({ verdict: "unsure", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
  });

  it.each([["negated", NOT_ENTERED], ["naming no person", ANY_CIRCLE]])("(e) refutes no marked row by words %s: not this path", async (_, words) => {
    const no = noQuoting(words);
    const { provider, seen } = answering(no, no, no, no);
    const report = await verify(provider);
    expect(seen.every((request) => !recheckOf(request).includes("start from those rows"))).toBe(true);
    expect(report.outcome.performed && report.outcome.code).not.toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.noRefutedByRecord);
    expect(report.outcome.performed && report.outcome.verdict).not.toBe("answers");
  });

  it("answers t771's double no over a row given a club its own cell does not hold, after one re-ask with that cell", async () => {
    const { provider, seen } = answering(INVENTED_CLUB_NO, INVENTED_CLUB_NO, INVENTED_CLUB_NO, INVENTED_CLUB_NO);
    const report = await verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: noticeRunSummary(), instructions: [noticeInstruction()], deniedEvidenceKeys: [], provider });
    expect(seen).toHaveLength(4);
    expect(recheckOf(seen[2])).toContain("its own cell is club: \"Ann Lee\", not \"Chess Club\"");
    expect(report.outcome).toMatchObject({ verdict: "answers", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.noRefutedByRecord });
  });

  it("counts a wrong value of a row the result never held as row evidence (not_kept): the case's re-ask shape is wholly refuted", async () => {
    const { provider, seen } = answering(RECAST_NO, RECAST_NO, RECAST_NO, RECAST_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(4);
    expect(recheckOf(seen[2])).toContain("start from those rows");
    expect(recheckOf(seen[2])).toContain("the result does not hold it; it was left out by condition 1");
    const outcome = report.outcome;
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "answers", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.noRefutedByRecord, calls: 4 });
    expect(outcome.refutedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ call: 1, kind: "wrong_value", evidence: "not_kept", quote: "left out by condition 1 (access startsWith [\"For members of\"])" }),
      expect.objectContaining({ call: 2, kind: "asked_missing", evidence: "outside_mark" })
    ]));
  });

  it("takes the first asks' refuted nos, then the case's re-ask shape: still wholly refuted, answers", async () => {
    const { provider } = answering(REFUTED_NO, REFUTED_NO, RECAST_NO, RECAST_NO);
    const report = await verify(provider);
    expect(report.outcome).toMatchObject({ verdict: "answers", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.noRefutedByRecord });
  });

  it("answers, through the real reader, a re-ask yes whose cited cells Core holds", async () => {
    const { provider } = answering(REFUTED_NO, REFUTED_NO, citingYes("Dana Ortiz"), REFUTED_NO);
    const report = await verify(provider);
    const outcome = report.outcome;
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "answers", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answers, yesCitations: { cited: 2, refuted: [] } });
    expect(outcome.refutedRows?.length).toBeGreaterThan(0);
  });

  it("is unsure, through the real reader, where a re-ask yes cites a cell Core does not hold", async () => {
    const { provider } = answering(REFUTED_NO, REFUTED_NO, citingYes("Ann Lee"), REFUTED_NO);
    const report = await verify(provider);
    const outcome = report.outcome;
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted, calls: 4 });
    expect(outcome.yesCitations?.refuted).toHaveLength(1);
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
  });

  it("keeps the refuted rows where a re-ask's yes is held and the existing rule leaves the outcome unsure (mvswewhy 0055 replay shape)", async () => {
    const heldYes = { answersRequest: "yes", expected: "Every notice of a circle the person belongs to.", observed: "The result holds the two circle notices." };
    const { provider } = answering(REFUTED_NO, REFUTED_NO, heldYes, heldYes, RECAST_NO);
    const report = await verify(provider);
    const outcome = report.outcome;
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome.verdict).toBe("unsure");
    expect(outcome.code).not.toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.noRefutedByRecord);
    expect(outcome.refutedRows?.length).toBeGreaterThan(0);
  });

  it("(f) leaves a computed fact that fails a Core no: no judge is asked", async () => {
    const fails: AutomationStudioResultComputedFact = { kind: "count", status: "fails", said: "Core counted 2 stored rows where the build declared 3.", defects: [] };
    computed.mockReturnValue([fails]);
    const { provider, seen } = answering(REFUTED_NO, REFUTED_NO, REFUTED_NO, REFUTED_NO);
    const report = await verify(provider);
    expect(seen).toHaveLength(0);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", basis: "core_observation", code: "core.result.computed_fact_failed" });
  });
});
