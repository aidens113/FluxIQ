// A row a presence condition left out is missing by the absence Core settled
// (framework plan P5, debug `run-mvtdoyf3-47ffaac1` fix F4,
// `../presence-settled.ts`): a defect naming that condition's column with
// "(no value)" is located though Core holds no cell of that column. On the
// made-up library catalog of `./garden-catalog-fixture.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";
import { catalogInstruction, catalogRequestText, catalogRunSummary, NO_ISBN } from "./garden-catalog-fixture.ts";

function located(defects: AutomationStudioLlmVerificationDefect[], summary: AutomationStudioRunResultSummary = catalogRunSummary()) {
  const requestText = catalogRequestText();
  const record = automationStudioResultNoRecord({ summary, requestText, wording: automationStudioRequestWording([catalogInstruction()], summary) });
  return automationStudioResultDefectsLocated(defects, { record, summary, requestText });
}

const missing = (column: string, value: string, row: string = NO_ISBN[0]!): AutomationStudioLlmVerificationDefect => ({ kind: "asked_missing", row, column, value, requestWords: "list every result the search shows" });

describe("a row an unstated presence condition left out, called missing (F4)", () => {
  it("is located where the defect names that condition's column with (no value) and its leftOutSettled holds the row", () => {
    const result = located([missing("isbn", "(no value)"), missing("isbn", "(no value)", NO_ISBN[1])]);
    expect(result.findings).toEqual([]);
    expect(result.located).toHaveLength(2);
  });

  it("is not located by another column's (no value), which its own cells contradict", () => {
    const result = located([missing("format", "(no value)")]);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("\"Paperback\"");
  });

  it("is not located where the condition did not settle the row", () => {
    const summary = catalogRunSummary();
    const { leftOutSettled: _settled, settled: _words, settledKind: _kind, ...unsettled } = summary.reads![0]!.conditions![1]!;
    summary.reads![0]!.conditions![1] = unsettled;
    expect(located([missing("isbn", "(no value)")], summary).located).toEqual([]);
  });
});
