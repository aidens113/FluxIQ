// @fluxiq-test-group real-sql
// The attempt's one result, wired (lane t905, design (d) phase 2): through the real service, a scripted model and real
// SQL for the rows, the draft's read steps are the result and a read outside the draft is a look (lead decision D1).
// The target is a lending library's list of loans read in pages, a kind of site none of the Lab's realistic scenarios
// is. Its read answers as the web domain's does: the list's key and the page the pager said, beside the rows.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult, AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { complete, fakeLibrary, READ_LOANS, runNode, scriptedAttempt, toolCall, type FakeLibrary } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const LIST_KEY = "list.loans-shelf";
const OVERDUE = { field: "due", before: "2031-01-01" };
const RENEWABLE = { field: "renewable", equals: "yes" };
const ADD = { add: true };

/** `count` loans named from `from`, as one page of the list. */
const loans = (from: number, count: number): JsonObject[] => Array.from({ length: count }, (_, index) => ({ title: `Loan ${from + index}`, due: "2030-01-01" }));

/**
 * The library's read in pages: a read's page is its `page` parameter, and what it keeps is the page's rows under its
 * conditions (`byConditions`, keyed by how many conditions it was asked under). Every read says the list's key and its
 * place, as the domain's list read does; a replay answers as a saved step's does.
 */
function pagedReads(byConditions: Record<number, Record<number, JsonObject[]>>) {
  return (call: { toolId: string; value: JsonObject }, _library: FakeLibrary): AutomationStudioLlmEvidenceToolExecutionResult | undefined => {
    if (call.value.node !== READ_LOANS || call.value.replay === "verify" || call.value.write === true) return undefined;
    const parameters = (call.value.parameters ?? {}) as JsonObject;
    const page = Number(parameters.page ?? 1);
    const where = Array.isArray(parameters.where) ? parameters.where : [];
    const rows = byConditions[where.length]?.[page] ?? [];
    const ran = { node: READ_LOANS, parameters, consequences: [] as JsonValue[] };
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { read: { extracted: rows.map((row) => ({ ...row })), listKey: LIST_KEY, place: `page=${page}` }, page: { heading: "Loans", page } },
      effectApplied: true,
      outputs: { records: rows.map((row) => ({ ...row })) },
      draft: { actionId: READ_LOANS, effect: "observe", proposes: true, input: call.value, ranWith: ran, replay: { from: { location: "library://loans" } } },
      ...(call.value.replay === "step" ? { resultCode: "core.replay.replayed" } : {}),
    };
  };
}

const read = (id: string, parameters: JsonObject, over: JsonObject = {}): JsonObject => runNode(id, READ_LOANS, parameters, [], over);

/** The header in the request's fixed slot. */
function headerOf(request: AutomationStudioLlmTaskRequest | undefined): string {
  const slot = request?.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.result")?.value as JsonObject | undefined;
  return String(slot?.result ?? "");
}

/** The result's line on the answer to `callId`, as a request shows it. */
function noteOn(request: AutomationStudioLlmTaskRequest | undefined, callId: string): string | undefined {
  const value = request?.context.evidenceLoop?.evidence.find((entry) => entry.callId === callId)?.value as JsonObject | undefined;
  return typeof value?.resultNote === "string" ? value.resultNote : undefined;
}

const decisions = (attempt: { requests: AutomationStudioLlmTaskRequest[] }) => attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision");
const resultTitles = (attempt: Awaited<ReturnType<typeof scriptedAttempt>>) => attempt.answered.status === "answered" ? (attempt.answered.result?.rows?.previewRows ?? []).map((row) => row.title) : [];

describe("the draft's read steps are the result, and a read outside the draft is a look", () => {
  it("a page-2 read by hand without add says it is a look, and the result stays the draft step's page", async () => {
    const attempt = await scriptedAttempt({
      library: fakeLibrary(),
      fault: pagedReads({ 1: { 1: loans(1, 3), 2: loans(4, 2) } }),
      script: [read("page-one", { where: [OVERDUE], page: 1 }, ADD), read("page-two", { where: [OVERDUE], page: 2 }), complete("Listed.")],
    }, cleanups);
    const last = decisions(attempt).at(-1);
    expect(noteOn(last, "page-two")).toMatch(/^a look: the result is unchanged \(step \d+, 3 rows\)/u);
    expect(headerOf(last)).toContain("3 rows over 1 page: page=1 (3)");
    expect(headerOf(last)).toContain("Looks not in it: call page-two (2 rows)");
    expect(resultTitles(attempt)).toEqual(["Loan 1", "Loan 2", "Loan 3"]);
  });

  it("a step's second version run from its step gives a header of 16 rows over 2 pages", async () => {
    const attempt = await scriptedAttempt({
      library: fakeLibrary(),
      fault: pagedReads({ 1: { 1: loans(1, 12), 2: loans(13, 5) }, 2: { 1: loans(1, 11), 2: loans(13, 5) } }),
      script: [
        read("page-one", { where: [OVERDUE], page: 1 }, ADD),
        // v2: one more condition, read again where it stands.
        { kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { parameters: { where: [OVERDUE, RENEWABLE], page: 1 } } }] },
        // The same list read the same way on its next page: the same step (D2).
        read("page-two", { where: [OVERDUE, RENEWABLE], page: 2 }, ADD),
        toolCall("forward", "core.run_flow", { from: 2 }),
        complete("Listed."),
      ],
    }, cleanups);
    const last = decisions(attempt).at(-1);
    expect(headerOf(last)).toMatch(/v2: 2 conditions\), 16 rows over 2 pages: page=1 \(11\), page=2 \(5\)/u);
    expect(resultTitles(attempt)).toHaveLength(16);
  });

  it("three reads of one list under three handles give one step with 3 pages", async () => {
    const attempt = await scriptedAttempt({
      library: fakeLibrary(),
      fault: pagedReads({ 0: { 1: loans(1, 2), 2: loans(3, 2), 3: loans(5, 1) } }),
      script: [
        read("week-one", { handle: "extraction.1", page: 1 }, ADD),
        read("week-two", { handle: "extraction.4", page: 2 }, ADD),
        read("week-three", { handle: "extraction.9", page: 3 }, ADD),
        complete("Listed."),
      ],
    }, cleanups);
    expect(headerOf(decisions(attempt).at(-1))).toContain("5 rows over 3 pages: page=1 (2), page=2 (2), page=3 (1)");
    expect(resultTitles(attempt)).toEqual(["Loan 1", "Loan 2", "Loan 3", "Loan 4", "Loan 5"]);
  });

  it("a completion on looks alone is refused naming take, and taking the look makes its rows the result", async () => {
    const attempt = await scriptedAttempt({
      library: fakeLibrary(),
      fault: pagedReads({ 0: { 1: loans(1, 3) } }),
      script: [read("by-hand", { page: 1 }), complete("Listed."), { kind: "amend_draft", amendments: [{ change: "take", call: "by-hand" }] }, complete("Listed.")],
    }, cleanups);
    const afterRefusal = decisions(attempt)[2];
    const refusal = JSON.stringify(afterRefusal?.context.evidenceLoop?.evidence ?? []);
    expect(refusal).toContain("answer_first.result_empty");
    expect(refusal).toContain('change \\"take\\"');
    expect(refusal).toContain("by-hand");
    expect(headerOf(decisions(attempt).at(-1))).toContain("3 rows over 1 page");
    expect(resultTitles(attempt)).toEqual(["Loan 1", "Loan 2", "Loan 3"]);
  });

  it("a draft that never assembles still has a result", async () => {
    const unknown = "domain.library.read_holds";
    const fault = pagedReads({ 0: { 1: loans(1, 2) } });
    const attempt = await scriptedAttempt({
      library: fakeLibrary(),
      // A read of a node the project's library does not hold: the domain answers it, and no Flow can be assembled from it.
      fault: (call, library) => {
        if (call.value.node !== unknown) return undefined;
        const answered = fault({ ...call, value: { ...call.value, node: READ_LOANS } }, library);
        return answered && { ...answered, draft: { ...answered.draft!, actionId: unknown, input: call.value } };
      },
      script: [runNode("holds", unknown, { page: 1 }, [], ADD), complete("Listed.")],
    }, cleanups);
    if (attempt.answered.status !== "answered") throw new Error("no answer");
    expect(attempt.answered.candidateId).toBeUndefined();
    expect(resultTitles(attempt)).toEqual(["Loan 1", "Loan 2"]);
  });
});
