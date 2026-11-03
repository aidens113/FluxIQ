// A no whose advice only says to keep, or to add, a condition the read already
// applies adds no exclusion, and is not asked again for one (t624). A replay of
// A8 bigbox `run-mv96rz68-532f5e52` step 0029's shape on another kind of site:
// one call said yes, the other no, ending its advice "Keep ... condition 4
// (name not contains Holder)". The negated test in Core's own naming of that
// condition was read as an exclusion the request never states, the call was
// asked again (0030), and its yes confirmed a wrong answer. Neither re-ask --
// t515's for an unstated exclusion, nor t607's for a refuted no -- may follow
// from it. Since t563 (Core 5a652d4a) a condition said to have "alone left out"
// rows that are stored by another copy is a missing claim Core refutes, so this
// no is now asked again once by t607 -- for those stored copies only, never for
// the conditions its advice keeps -- and t515 still never asks it again. No
// model is called; the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading } from "../../refuted-no/index.ts";
import { AUDIOBOOKS_INSTRUCTION, AUDIOBOOKS_PROMOTED, AUDIOBOOKS_READ, AUDIOBOOKS_REQUEST, AUDIOBOOKS_YES, audiobooksRunSummary } from "../../value-readings/tests/audiobooks-fixture.ts";
import { automationStudioRequestWording } from "../request-wording.ts";
import { automationStudioRequestUnstatedExclusions } from "../unstated-exclusions.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** The no of step 0029, in this site's words: a wrong reason about condition 1, and advice to keep two conditions the read applies. */
const KEEP_NO = {
  answersRequest: "no",
  defects: [],
  expected: AUDIOBOOKS_YES.expected,
  observed: `3 rows stored. Condition 1 (promoted is absent) alone left out 2 rows the request asks for: ${AUDIOBOOKS_PROMOTED.join("; ")}. These are ordinary titles, not promoted entries, so the request does not exclude them.`,
  changed: `Remove or replace condition 1 (promoted is absent) on ${AUDIOBOOKS_READ}, which is dropping rows the request asks for. Keep condition 3 (rating atLeast 4) and condition 4 (title not contains Sampler).`
};

function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request) => {
        const diagnosis = diagnoses[seen.length] ?? diagnoses[diagnoses.length - 1] ?? {};
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE };
      }
    }
  };
}

const wording = () => automationStudioRequestWording([AUDIOBOOKS_INSTRUCTION], audiobooksRunSummary())!;

describe("an advice's exclusion the read already applies", () => {
  it("is not marked when the advice keeps it, or adds it again", () => {
    expect(automationStudioRequestUnstatedExclusions(KEEP_NO.changed, wording())).toEqual([]);
    expect(automationStudioRequestUnstatedExclusions("Add a condition title not contains Sampler to the read.", wording())).toEqual([]);
  });

  it("is still marked where no condition of the read leaves rows out by those words", () => {
    expect(automationStudioRequestUnstatedExclusions("Add a condition title not contains Bonus Chapters to the read.", wording())).toEqual(["not contains Bonus Chapters to the read"]);
    expect(automationStudioRequestUnstatedExclusions("Exclude entries narrated by Okafor.", wording())).toEqual(["Exclude entries narrated by Okafor"]);
  });

  it("is no finding of Core's: the no is refuted only by the stored copies it calls left out (t563)", () => {
    const record = automationStudioResultNoRecord({ summary: audiobooksRunSummary(), requestText: AUDIOBOOKS_REQUEST, wording: wording() });
    expect(automationStudioResultRefutedReading(KEEP_NO, record)).toEqual({
      wholly: true,
      findings: [AUDIOBOOKS_PROMOTED.map((title) => `"${title}" is in the stored rows: another copy of it was kept.`).join(" ")]
    });
  });
});

/** The recheck a request carries, where Core asked a call again. */
function recheckOf(request: unknown): string | undefined {
  if (!request || typeof request !== "object") return undefined;
  const record = request as Record<string, unknown>;
  if (typeof record.recheck === "string") return record.recheck;
  for (const value of Object.values(record)) {
    const found = recheckOf(value);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("a split whose no only keeps conditions the read applies", () => {
  it("is asked again once, for the stored copies it calls left out, never for the conditions it keeps", async () => {
    const { provider, seen } = answering(AUDIOBOOKS_YES, KEEP_NO, KEEP_NO);
    const judge = automationStudioBuildTestJudge({ instructions: [AUDIOBOOKS_INSTRUCTION], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });
    const verdict = await judge({ summary: audiobooksRunSummary(), budget: { maxCostUsd: 0.2 } });
    expect(seen).toHaveLength(3);
    expect(verdict.verdict).toBe("unknown");
    expect(JSON.stringify(seen)).not.toContain("never states as an exclusion");
    const recheck = recheckOf(seen[2]);
    for (const title of AUDIOBOOKS_PROMOTED) expect(recheck).toContain(`"${title}" is in the stored rows: another copy of it was kept.`);
    expect(recheck).not.toMatch(/condition [34]|Sampler|rating atLeast/u);
  });
});
