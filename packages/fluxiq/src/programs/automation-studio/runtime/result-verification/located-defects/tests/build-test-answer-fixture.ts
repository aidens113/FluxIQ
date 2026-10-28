// A made-up evening-class timetable for a no of a build's test (t771): a request
// for every lesson of the courses the person is enrolled in, and a test whose
// read kept a lesson of a course they are not enrolled in. A test stores no
// record set: what its Flow would store is `buildTest.stores`, each dataset's
// answer by its rows' labels (`../../build-test/stores.ts`). No task, site,
// item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

/** The request: lessons of enrolled courses only. */
export const LESSON_REQUEST = "List every lesson of the courses I am enrolled in that starts on or after 6 March 2027, with its title, course and start time.";

/** The request's own words a lesson of another course fails. */
export const ENROLLED_WORDS = "the courses I am enrolled in";

/** The lessons the test's read kept, by label: two of an enrolled course, and one of a course the person is not enrolled in. */
export const ENROLLED_LESSONS = ["Throwing a bowl on the wheel", "Glazing and firing basics"] as const;
export const OTHER_COURSE_LESSON = "Watercolour skies at dusk";

/** The request as a Flow's instruction states it. */
export function lessonInstruction(): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Enrolled lessons", body: LESSON_REQUEST,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/**
 * A build's test of a Flow that opens the timetable and reads its lessons into
 * one dataset: `kept` the labels the read returned, and the answer its store
 * makes of them. The test itself stored nothing (`recordSets` is empty).
 */
export function lessonTestSummary(kept: readonly string[] = [...ENROLLED_LESSONS, OTHER_COURSE_LESSON]): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 0,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 0,
    recordSets: [],
    flowShape: [],
    withheld: false,
    buildTest: {
      kind: "build_test", test: "ran",
      steps: [
        { step: 1, action: "example.open", target: ["Timetable"], outcome: "replayed" },
        { step: 2, action: "example.read-list", target: ["lessons"], outcome: "replayed", observed: { said: `The read kept ${kept.length} lessons.`, readRows: { rows: [...kept] } } }
      ],
      stores: [{ dataset: "lessons", writeMode: "append", steps: [2], passes: 1, collected: kept.length, answer: { rows: kept.length, labels: [...kept] } }]
    }
  };
}

/** A no naming the kept lesson of the other course, by its label, quoting the request. */
export const KEPT_OTHER_COURSE_NO = {
  answersRequest: "no",
  expected: "Every lesson of an enrolled course on or after 6 March 2027.",
  observed: `The answer keeps "${OTHER_COURSE_LESSON}", a lesson of a painting course the person is not enrolled in.`,
  changed: "Keep only the lessons whose course is one the person is enrolled in.",
  defects: [{ kind: "kept_not_asked", row: OTHER_COURSE_LESSON, requestWords: ENROLLED_WORDS }]
};

/** A no calling an enrolled lesson missing that the test's answer holds. */
export const MISSING_HELD_NO = {
  answersRequest: "no",
  expected: "Every lesson of an enrolled course on or after 6 March 2027.",
  observed: `The answer lacks "${ENROLLED_LESSONS[1]}".`,
  changed: "Read the whole timetable.",
  defects: [{ kind: "asked_missing", row: ENROLLED_LESSONS[1], requestWords: "every lesson of the courses I am enrolled in" }]
};
