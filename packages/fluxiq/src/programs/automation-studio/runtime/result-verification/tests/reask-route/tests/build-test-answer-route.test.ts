// A build test's no that names a row of what the test would store, through the
// build-test judge and the verification (t771). A build test stores no record
// set, so before t771 its kept rows were in no record Core grounds a no in: a
// no naming one came to unsure (`../../../agreement/unsupported-no.ts`) and the
// build was told "unknown" instead of a repair. Now that no is the build's no,
// carrying the judge's reading as repair feedback; the same claim against an
// answer without that row stays unknown. On the made-up timetable of
// `../../../located-defects/tests/build-test-answer-fixture.ts`; no model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import {
  ENROLLED_LESSONS,
  KEPT_OTHER_COURSE_NO,
  MISSING_HELD_NO,
  lessonInstruction,
  lessonTestSummary
} from "../../../located-defects/tests/build-test-answer-fixture.ts";
import { automationStudioBuildTestJudge } from "../../../build-test/index.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A provider answering each call with the next scripted diagnosis, keeping every request it was sent. */
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

const judge = (provider: AutomationStudioLlmProvider, summary = lessonTestSummary()) =>
  automationStudioBuildTestJudge({ instructions: [lessonInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider })({ summary, budget: { maxCostUsd: 0.2 } });

describe("a build test's no naming a row of what the test would store (t771)", () => {
  it("is the build's no, with the judge's reading for its repair, where the answer holds the kept row", async () => {
    const { provider, seen } = answering(KEPT_OTHER_COURSE_NO, KEPT_OTHER_COURSE_NO);
    const verdict = await judge(provider);
    // Two calls, no re-ask: the row it names is in Core's record of the test.
    expect(seen).toHaveLength(2);
    expect(seen[0]?.context.resultSummary?.buildTest?.stores?.[0]?.answer.labels).toContain(KEPT_OTHER_COURSE_NO.defects[0]!.row);
    expect(verdict).toMatchObject({ verdict: "no", observed: KEPT_OTHER_COURSE_NO.observed, advice: KEPT_OTHER_COURSE_NO.changed, records: { stored: 3 } });
    expect(verdict).not.toHaveProperty("unsupportedNo");
  });

  it("stays unknown, never no, where the answer lacks that row, even asked once more", async () => {
    const { provider, seen } = answering(KEPT_OTHER_COURSE_NO, KEPT_OTHER_COURSE_NO, KEPT_OTHER_COURSE_NO, KEPT_OTHER_COURSE_NO);
    const verdict = await judge(provider, lessonTestSummary(ENROLLED_LESSONS));
    expect(seen).toHaveLength(4);
    expect(verdict).toMatchObject({ verdict: "unknown", unsupportedNo: true });
  });

  it("stays unknown where it calls missing a row the test's answer holds", async () => {
    const { provider, seen } = answering(MISSING_HELD_NO, MISSING_HELD_NO, MISSING_HELD_NO, MISSING_HELD_NO);
    const verdict = await judge(provider);
    expect(seen).toHaveLength(4);
    expect(verdict).toMatchObject({ verdict: "unknown", unsupportedNo: true });
  });
});
