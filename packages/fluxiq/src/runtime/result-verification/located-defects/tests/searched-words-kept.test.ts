// A kept row is not "not asked" by the words a request searched by, where the
// request asks for every result its search shows (framework plan P5, debug
// `run-mvtdoyf3-47ffaac1` fix F3, `../searched-words-kept.ts`); a request for
// a kind of thing is held as before (t628). On the made-up library catalog of
// `./garden-catalog-fixture.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";
import { catalogInstruction, catalogRequestText, catalogRunSummary, EVERY_RESULT_REQUEST, GLOVE_HOOK, KIND_REQUEST, SEARCH_WORDS } from "./garden-catalog-fixture.ts";

function located(defects: AutomationStudioLlmVerificationDefect[], body: string = EVERY_RESULT_REQUEST, withText = true) {
  const summary = catalogRunSummary();
  const requestText = catalogRequestText(body);
  const wording = automationStudioRequestWording([catalogInstruction(body)], summary);
  const record = automationStudioResultNoRecord({ summary, requestText, wording });
  return automationStudioResultDefectsLocated(defects, { record, summary, ...(withText ? { requestText } : {}) });
}

const keptNotAsked = (row: string, requestWords: string): AutomationStudioLlmVerificationDefect => ({ kind: "kept_not_asked", row, requestWords });

describe("a kept row called not asked by the searched words alone, under a request for every result (F3)", () => {
  it("is not located where the row's own label says every request phrase the quote holds", () => {
    const result = located([keptNotAsked(GLOVE_HOOK, SEARCH_WORDS)]);
    expect(result.located).toEqual([]);
    const findings = result.findings.join(" ");
    expect(findings).toContain(`"${GLOVE_HOOK}" is a row the result keeps, and the request asks for every result it looks through`);
    expect(findings).toContain("the row's own label says \"for garden gloves\", so");
  });

  it("is located as before under a request for a kind of thing (t628 unchanged)", () => {
    expect(located([keptNotAsked(GLOVE_HOOK, "Find garden gloves")], KIND_REQUEST).located).toHaveLength(1);
  });

  it("is located as before where the quote states an exclusion, or where the caller gives no request text", () => {
    expect(located([keptNotAsked(GLOVE_HOOK, "leaving out reference copies")]).located).toHaveLength(1);
    expect(located([keptNotAsked(GLOVE_HOOK, SEARCH_WORDS)], EVERY_RESULT_REQUEST, false).located).toHaveLength(1);
  });

  it("is located as before over a kept row whose own label does not say the searched phrase", () => {
    // Every other kept row says "garden gloves"; a quote of the whole clause holds that phrase, which this label lacks.
    const summary = catalogRunSummary();
    summary.recordSets[0]!.sampleRows = [...(summary.recordSets[0]!.sampleRows ?? []), { title: "Hand Trowel Primer", format: "Paperback" }];
    const requestText = catalogRequestText();
    const record = automationStudioResultNoRecord({ summary, requestText, wording: automationStudioRequestWording([catalogInstruction()], summary) });
    expect(automationStudioResultDefectsLocated([keptNotAsked("Hand Trowel Primer", SEARCH_WORDS)], { record, summary, requestText }).located).toHaveLength(1);
  });
});
