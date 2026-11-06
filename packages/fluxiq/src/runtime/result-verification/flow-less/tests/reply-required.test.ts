// What Core's reader needs of the Flow-less judge's reply is exactly what its grammar requires (t875, lane B
// `run-mw4coxdn-e2b30c8c`): each key whose absence from a sound reply changes what the judge concludes is a key
// the schema requires, and no other. Measured through the real harness with a scripted provider: no model is
// called. The fixture is a choir's music library, a kind of site no realistic scenario uses.
import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioLlmTaskOutputSchema } from "../../../llm/provider-task/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const summary: AutomationStudioFlowLessSummary = {
  instructions: "List every piece on my borrowed shelf, with its title and composer.",
  rows: { totalRows: 2, truncated: false, columns: [{ id: "title", label: "Title" }, { id: "composer", label: "Composer" }], rows: [{ title: "Evening Anthem", composer: "Ward" }, { title: "Psalm Setting", composer: "Hale" }] },
  acts: []
};
const DIAGNOSIS_YES = {
  answersRequest: "yes", expected: "Every piece on the shelf.", observed: "The shelf shows 2 pieces, both held.", changed: "Nothing changed.",
  stillAchievable: "yes", deterministicRecoveryPossible: "yes", defects: [],
  checked: [{ row: "Evening Anthem", column: "composer", value: "Ward" }, { row: "Psalm Setting", column: "composer", value: "Hale" }],
  answerRecords: { asked: true, siteShows: 2 }, explorationNeeded: false, patchNeeded: false
};
const DIAGNOSIS_NO = { ...DIAGNOSIS_YES, answersRequest: "no", observed: "The shelf shows 3 pieces.", defects: [{ kind: "asked_missing", row: "rows not read", requestWords: "every piece" }], answerRecords: { asked: true, siteShows: 3 } };
const reply = (diagnosis: Record<string, unknown>) => ({ kind: "diagnosis", diagnosis, confidence: 0.9, summary: "Judged." });

/** What the judge concludes from one scripted reply, repeated on any re-ask: its verdict and how many calls it took. */
async function concluded(response: Record<string, unknown>): Promise<{ verdict: string; calls: number; seen: AutomationStudioLlmTaskRequest[] }> {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    estimateCostUsd: () => 0.001,
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      seen.push(request);
      return { response, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
    }
  };
  const judged = await automationStudioFlowLessJudge({ summary, provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [] });
  return { verdict: judged.verdict, calls: seen.length, seen };
}

function without(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _gone, ...rest } = record;
  return rest;
}

/** The keys of `full` whose absence changes the conclusion `full` reaches. */
async function needed(full: Record<string, unknown>, keys: readonly string[], drop: (key: string) => Record<string, unknown>): Promise<string[]> {
  const sound = await concluded(full);
  const found: string[] = [];
  for (const key of keys) {
    const got = await concluded(drop(key));
    if (got.verdict !== sound.verdict || got.calls !== sound.calls) found.push(key);
  }
  return found;
}

describe("the Flow-less judge's reply: what the reader needs is what the grammar requires", () => {
  it("concludes yes and no in one call from sound replies", async () => {
    expect(await concluded(reply(DIAGNOSIS_YES))).toMatchObject({ verdict: "yes", calls: 1 });
    expect(await concluded(reply(DIAGNOSIS_NO))).toMatchObject({ verdict: "no", calls: 1 });
  });

  it("needs of the reply exactly the members its schema requires", async () => {
    const { seen } = await concluded(reply(DIAGNOSIS_YES));
    const schema = automationStudioLlmTaskOutputSchema(seen[0]!) as { required: string[] };
    const full = reply(DIAGNOSIS_YES);
    expect((await needed(full, Object.keys(full), (key) => without(full, key))).sort()).toEqual([...schema.required].sort());
  });

  it("needs of the diagnosis, over a yes and a no, exactly the keys its schema requires", async () => {
    const { seen } = await concluded(reply(DIAGNOSIS_YES));
    const schema = automationStudioLlmTaskOutputSchema(seen[0]!) as { properties: { diagnosis: { required: string[] } } };
    const onYes = await needed(reply(DIAGNOSIS_YES), Object.keys(DIAGNOSIS_YES), (key) => reply(without(DIAGNOSIS_YES, key)));
    const onNo = await needed(reply(DIAGNOSIS_NO), Object.keys(DIAGNOSIS_NO), (key) => reply(without(DIAGNOSIS_NO, key)));
    expect([...new Set([...onYes, ...onNo])].sort()).toEqual([...schema.properties.diagnosis.required].sort());
  });

  it("reads a blank summary as none, which no grammar can forbid", async () => {
    expect(await concluded({ ...reply(DIAGNOSIS_YES), summary: "" })).toMatchObject({ verdict: "yes", calls: 1 });
  });
});
