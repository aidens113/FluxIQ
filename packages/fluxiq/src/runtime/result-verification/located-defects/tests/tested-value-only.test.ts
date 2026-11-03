// A no calling a left-out row missing by the very value one condition tested
// and left it out for is not located where the request does not say that
// value (t785, `../tested-value-only.ts`); where the request names it, it is
// located as before. Run `run-mvskodlp-9966d618`'s shape, on the made-up club
// board of `./club-posts-fixture.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";
import { MEMBER_REQUEST, NAMED_CLUBS_REQUEST, clubPostsInstruction, clubPostsRunSummary } from "./club-posts-fixture.ts";

function located(defects: AutomationStudioLlmVerificationDefect[], request: string) {
  const summary = clubPostsRunSummary();
  const wording = automationStudioRequestWording([clubPostsInstruction(request)], summary);
  const record = automationStudioResultNoRecord({ summary, requestText: request, wording });
  return automationStudioResultDefectsLocated(defects, { record, summary });
}

const missing: AutomationStudioLlmVerificationDefect = { kind: "asked_missing", row: "Ann Lee — C Club", column: "club", value: "C Club", requestWords: MEMBER_REQUEST };

describe("a row called missing by the value one condition tested and left it out for (t785)", () => {
  it("is not located where the request does not say that value, and Core's finding names the condition", () => {
    const result = located([missing], MEMBER_REQUEST);
    expect(result.located).toEqual([]);
    expect(result.findings).toEqual([
      "Core's record of \"Ann Lee — C Club\" holds \"C Club\" in \"club\", the value condition 1 (club equals [\"A Club\", \"B Club\"]) tested and left out as written; the request does not say \"C Club\", so whether it asks for that row is not something Core can find in the row's cells."
    ]);
  });

  it("is located where the request names that value", () => {
    const result = located([{ ...missing, requestWords: NAMED_CLUBS_REQUEST }], NAMED_CLUBS_REQUEST);
    expect(result.findings).toEqual([]);
    expect(result.located).toHaveLength(1);
  });
});
