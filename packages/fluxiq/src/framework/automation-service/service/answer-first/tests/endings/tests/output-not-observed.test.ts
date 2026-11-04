// @fluxiq-test-group real-sql
// `web.action.rejected.output_not_observed` appears in 14 failed saved runs and no passed one, and
// t854 sent one case of it to the re-author. Exploration keeps going through it, in every form:
// a read refused this way is a failed step the model sees, stores no rows, loses no earlier rows,
// and ends nothing. The forms are Core's own failure records (`engine/automation/records/capture.ts`,
// `framework/automation-service/io-policy.ts`) and the web domain's three codes that map to it.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../../runtime/llm/index.ts";
import { complete, fakeLibrary, READ_LOANS, runNode, scriptedAttempt } from "../../fake-library.ts";
import { expectReached, judgeCalls } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CODE = "web.action.rejected.output_not_observed";
const REFUSED: JsonObject = { ok: false, code: "output_not_observed", detail: { reason: "read_empty" } };
const failure = (code: string, retryable: boolean, stage: "dispatch" | "confirmation" | "verification") => ({ category: "output_not_observed" as const, code, retryable, stage });

/** Each form, as an answer to a read that came back with rows the task must not keep. */
const FORMS: ReadonlyArray<[string, AutomationStudioLlmEvidenceToolExecutionResult]> = [
  ["record_output.records_refused, every row refused by the schema", { kind: "llm_evidence_tool_execution", evidence: REFUSED, effectApplied: false, resultCode: CODE, failure: failure("record_output.records_refused", false, "dispatch"), outputs: { error: { code: "record_output.records_refused", issues: ["record_output.invalid_row"] } } }],
  ["record_output.records_missing, no list where one was asked", { kind: "llm_evidence_tool_execution", evidence: REFUSED, effectApplied: false, resultCode: CODE, failure: failure("record_output.records_missing", true, "dispatch") }],
  ["record_output.intermediate_incomplete, a partial list refused", { kind: "llm_evidence_tool_execution", evidence: REFUSED, effectApplied: false, resultCode: CODE, failure: failure("record_output.intermediate_incomplete", false, "dispatch") }],
  ["output_confirmation.not_received, the confirmation never came", { kind: "llm_evidence_tool_execution", evidence: REFUSED, effectApplied: false, resultCode: CODE, failure: failure("output_confirmation.not_received", true, "confirmation") }],
  ["the domain's own refusal, with no failure record", { kind: "llm_evidence_tool_execution", evidence: REFUSED, effectApplied: false, resultCode: CODE }],
  ["the domain's refusal holding what the read came back with", { kind: "llm_evidence_tool_execution", evidence: { ...REFUSED, read: { extracted: [{ title: "Half a row", due: "" }] } }, effectApplied: false, resultCode: CODE, outputs: { records: [{ title: "Half a row", due: "" }] } }],
  ["web.validation.state_mismatch, as the domain maps it", { kind: "llm_evidence_tool_execution", evidence: { ...REFUSED, detail: { reason: "state_not_as_asserted" } }, effectApplied: false, resultCode: CODE, failure: failure("web.validation.state_mismatch", true, "verification") }],
  ["web.validation.option_not_offered, as the domain maps it", { kind: "llm_evidence_tool_execution", evidence: { ...REFUSED, detail: { reason: "option_not_offered" } }, effectApplied: false, resultCode: CODE, failure: failure("web.validation.option_not_offered", false, "verification") }]
];

describe("a read refused as output_not_observed", () => {
  it.each(FORMS)("%s: a failed step the model sees, no rows stored, earlier rows kept, and the task reaches its result", async (_name, refusal) => {
    let refusals = 1;
    let told = "";
    const library = fakeLibrary();
    const attempt = await scriptedAttempt({
      library,
      fault: (call) => call.value.node === READ_LOANS && (call.value.parameters as JsonObject | undefined)?.page === 2 && refusals-- > 0 ? refusal : undefined,
      script: [
        runNode("read", READ_LOANS, {}, [], { add: true }),
        runNode("read.refused", READ_LOANS, { page: 2 }, [], {}),
        (request) => {
          told = JSON.stringify(request.context.evidenceLoop?.evidence);
          return complete("Listed what the first read returned.");
        }
      ]
    }, cleanups);
    expect(told).toContain("output_not_observed");
    const answer = expectReached(attempt);
    // The earlier read's rows, and none from the refused one.
    expect(answer.result?.rows?.previewRows.map((row) => row.title)).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
    expect(JSON.stringify(answer.result)).not.toContain("Half a row");
    expect(judgeCalls(attempt)).toHaveLength(1);
    expect(new Set(attempt.requests.map((request) => request.taskKind))).toEqual(new Set(["evidence_tool_decision", "loop_verification"]));
  });

  it("as the only read, stores nothing and leaves nothing to judge, and the next read reaches the result", async () => {
    let refusals = 1;
    let told = "";
    const attempt = await scriptedAttempt({
      fault: (call) => call.value.node === READ_LOANS && refusals-- > 0 ? FORMS[0]![1] : undefined,
      script: [
        runNode("read.refused", READ_LOANS, { from: "the first way" }, [], { add: true }),
        complete("Nothing yet."),
        (request) => {
          told = JSON.stringify(request.context.evidenceLoop?.evidence);
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        complete("Listed.")
      ]
    }, cleanups);
    expect(told).toContain("answer_first.nothing_to_judge");
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(judgeCalls(attempt)).toHaveLength(1);
  });
});
