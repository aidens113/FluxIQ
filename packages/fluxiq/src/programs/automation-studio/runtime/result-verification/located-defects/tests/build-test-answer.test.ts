// Each row defect a no of a build's test lists, located in Core's record of what
// that test would store (t771). A test stores no record set, so before t771 the
// record held no stored row for it: a kept row could never be found, and a row
// the test read was "found" missing even where its answer held it. The record
// now holds each label of the test's answer (`buildTest.stores`), as a finished
// run's holds its stored rows. On the made-up timetable of
// `./build-test-answer-fixture.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioResultDefectsLocated } from "../index.ts";
import { ENROLLED_LESSONS, ENROLLED_WORDS, LESSON_REQUEST, OTHER_COURSE_LESSON, lessonInstruction, lessonTestSummary } from "./build-test-answer-fixture.ts";

function located(defects: AutomationStudioLlmVerificationDefect[], summary: AutomationStudioRunResultSummary = lessonTestSummary()) {
  const wording = automationStudioRequestWording([lessonInstruction()], summary);
  const record = automationStudioResultNoRecord({ summary, requestText: LESSON_REQUEST, wording });
  return automationStudioResultDefectsLocated(defects, { record, summary });
}

describe("a row defect of a build's test, located in what the test would store (t771)", () => {
  it("holds each label of the test's answer as a stored row of Core's record", () => {
    const summary = lessonTestSummary();
    const record = automationStudioResultNoRecord({ summary, requestText: LESSON_REQUEST, wording: automationStudioRequestWording([lessonInstruction()], summary) });
    expect(record.stored.map((row) => row.label)).toEqual([...ENROLLED_LESSONS, OTHER_COURSE_LESSON]);
  });

  it("locates a kept row the test's answer holds", () => {
    expect(located([{ kind: "kept_not_asked", row: OTHER_COURSE_LESSON, requestWords: ENROLLED_WORDS }])).toEqual({ located: [expect.objectContaining({ kind: "kept_not_asked" })], findings: [] });
  });

  it("does not locate that kept row where the test's answer lacks it", () => {
    const result = located([{ kind: "kept_not_asked", row: OTHER_COURSE_LESSON, requestWords: ENROLLED_WORDS }], lessonTestSummary(ENROLLED_LESSONS));
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("is no row the result holds");
  });

  it("does not locate a row called missing that the test's answer holds, though the test's read saw it", () => {
    const result = located([{ kind: "asked_missing", row: ENROLLED_LESSONS[1], requestWords: "every lesson of the courses I am enrolled in" }]);
    expect(result.located).toEqual([]);
    expect(result.findings.join(" ")).toContain("is a row the result holds");
  });

  it("never holds a withheld label as a row", () => {
    const summary = lessonTestSummary();
    summary.buildTest!.stores![0]!.answer.labels.push("(withheld)");
    const record = automationStudioResultNoRecord({ summary, requestText: LESSON_REQUEST });
    expect(record.stored.map((row) => row.label)).not.toContain("(withheld)");
  });

  it("still locates an act defect in the test's steps beside its rows", () => {
    const result = located([{ kind: "act_wrong", step: "1", row: "Timetable", requestWords: ENROLLED_WORDS }]);
    expect(result.located).toHaveLength(1);
  });
});
