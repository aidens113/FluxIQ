// The result check's card for a build's test says what the Flow would store
// (t274-c3; live run `run-muw60j7c-bb7c9a62`, cause C-3). Its two reads would
// have stored 30 rows, 3 of them twice, and the card read "Passed: no rows came
// back", because a test stores nothing and Core's observation counted 0.
import { describe, expect, it } from "vitest";
import { automationStudioResultCheckWords } from "../check-words.ts";
import type { AutomationStudioResultVerification } from "../contracts.ts";

const answered = (observation: string): AutomationStudioResultVerification => ({
  schemaVersion: "automation-studio.result-verification.v1",
  verdict: "answers",
  basis: "model",
  code: "core.result.answers_request",
  reason: "The result was judged to answer the request.",
  observation
});

describe("the check's card for a build's test", () => {
  it("says how many rows the Flow would store, never that none came back", () => {
    const words = automationStudioResultCheckWords(answered("30 records would be stored; the Flow's steps were web.output.dom-extract_list, web.output.dom-extract_list."));
    expect(words).toBe("30 rows would be stored. The result was judged to answer the request.");
  });

  it("says one row in the singular, and none as none", () => {
    expect(automationStudioResultCheckWords(answered("1 record would be stored."))).toMatch(/^1 row would be stored\. /u);
    expect(automationStudioResultCheckWords(answered("0 records would be stored."))).toMatch(/^No rows would be stored\. /u);
  });

  it("still says a finished run's rows as rows that came back", () => {
    expect(automationStudioResultCheckWords(answered("13 records stored, across 1 record set."))).toMatch(/^13 rows came back\. /u);
  });

  // Lane A round 4, `run-muxkzdjw-31a13429` (moment 8): a cart Flow that reads no list was carded "Didn't
  // pass: no rows would be stored, and no step presses "Add to cart"", and round 3's pass "Passed: no rows
  // would be stored". A Flow that writes to no dataset has no rows to count, as a run's ending already
  // says (`../../activity/wording/run-ending.ts`, run `run-muw5zv4m-52d83027`).
  it("says no rows at all for a Flow that stores into no dataset, a build's test or a finished run", () => {
    const shape = "; the Flow's steps were web.output.browser-navigate, web.output.dom-click.";
    expect(automationStudioResultCheckWords(answered(`0 records would be stored, in 0 datasets${shape}`))).toBe("The result was judged to answer the request.");
    expect(automationStudioResultCheckWords(answered(`0 records stored, across 0 record sets${shape}`))).toBe("The result was judged to answer the request.");
  });

  it("still says none for a Flow whose read would store into a dataset and found nothing", () => {
    expect(automationStudioResultCheckWords(answered("0 records would be stored, in 1 dataset; the Flow's steps were web.output.dom-extract_list."))).toMatch(/^No rows would be stored\. /u);
    expect(automationStudioResultCheckWords(answered("0 records stored, across 1 record set."))).toMatch(/^No rows came back\. /u);
  });
});
