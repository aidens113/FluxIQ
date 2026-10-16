// A stub-judge replay of A8 frozen pair 5 candidate towels
// `run-mva6mlo8-f519063c`, trial 6 (steps 0059-0062, t652), on the library
// catalogue of `./library-fixture.ts`, whose run stores
// exactly the titles asked for. One call says yes; the other says no, claiming
// a title the result stores is missing and asking for the search and filter
// steps to be verified. Before t652 neither split branch weighed the no for a
// label, so its reading reached the builder unlabelled beside gate words
// saying nothing in Core's record contradicted it. Now the no's reading
// carries Core's label for the part its record refutes, and the field beside
// it says `part`; the verdict stays unsure either way round. A split no that
// names nothing Core can check stays as it was. No model is called; the
// provider is scripted. No task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestVerdict } from "../../build-test/index.ts";
import { libraryInstruction, libraryRunSummary } from "./library-fixture.ts";
import { LIBRARY_YES } from "./library-readings-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A title the run stored. */
const STORED_TITLE = "The Glass Orchard Murders, Paperback";
const EXPECTED = "Every mystery novel available to borrow today and rated 4 or higher, from every page, each title once, without audiobook editions.";

/** Step 0060's shape: a stored title called missing, beside a doubt about the step before the read that Core cannot settle. */
const PART_NO = {
  answersRequest: "no",
  expected: EXPECTED,
  observed: `Missing qualifying items include ${STORED_TITLE}. The search step before the read does not limit the results to novels.`,
  changed: "Verify the search and filter steps before the read so they keep every title asked for."
};

/** A no that names nothing Core can check: only the steps, to be verified. */
const UNCHECKABLE_NO = {
  answersRequest: "no",
  expected: EXPECTED,
  observed: "The search and filter steps before the read need verification.",
  changed: "Verify the search and filter steps before the read."
};

function answering(...diagnoses: Record<string, unknown>[]): AutomationStudioLlmProvider {
  let calls = 0;
  return { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: diagnoses[calls++] ?? {} }, usage: USAGE }) };
}

async function judged(...diagnoses: Record<string, unknown>[]): Promise<AutomationStudioBuildTestVerdict> {
  const judge = automationStudioBuildTestJudge({ instructions: [libraryInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider: answering(...diagnoses) });
  return judge({ summary: libraryRunSummary(), budget: { maxCostUsd: 0.2 } });
}

function reading(verdict: AutomationStudioBuildTestVerdict) {
  return verdict.verdict === "unknown" ? verdict.unconfirmedReading : undefined;
}

describe("a split's no Core's record refutes in part (t652)", () => {
  it("is labelled, with recordContradicts part, when the yes came first", async () => {
    const verdict = await judged(LIBRARY_YES, PART_NO);
    expect(verdict).toMatchObject({ verdict: "unknown", oneCallSaidYes: true });
    expect(verdict.spent.calls).toBe(2);
    const read = reading(verdict);
    expect(read?.recordContradicts).toBe("part");
    expect(String(read?.observed)).toMatch(/^Judge call 2 \(Core's record contradicts part of this reading: .+\): Missing qualifying items include /u);
    expect(String(read?.observed)).toContain(STORED_TITLE);
    expect(String(read?.advice)).toContain(`Judge call 2 (Core's record contradicts part of this reading:`);
    expect(String(read?.advice)).toContain(PART_NO.changed);
  });

  it("is labelled the same way when the no came first", async () => {
    const verdict = await judged(PART_NO, LIBRARY_YES);
    expect(verdict).toMatchObject({ verdict: "unknown", oneCallSaidYes: true });
    const read = reading(verdict);
    expect(read?.recordContradicts).toBe("part");
    expect(String(read?.observed)).toMatch(/^Judge call 1 \(Core's record contradicts part of this reading: /u);
  });

  it("leaves a split no that names nothing Core can check unlabelled, the verdict still unsure", async () => {
    for (const order of [[LIBRARY_YES, UNCHECKABLE_NO], [UNCHECKABLE_NO, LIBRARY_YES]]) {
      const verdict = await judged(...order);
      expect(verdict.verdict).toBe("unknown");
      const read = reading(verdict);
      expect(read?.recordContradicts).toBeUndefined();
      expect(read?.observed).toBe(UNCHECKABLE_NO.observed);
      expect(read?.advice).toBe(UNCHECKABLE_NO.changed);
    }
  });
});
