// t965: the Flow-less judge's request is fitted to the judging model's window before it is sent, by a measure that does
// not under-count dense text, and a provider's refusal for size is answered with the next shorter form, never read as
// not judged. Live run `run-mwodpw10-3d5748ab`, judge 0117: 2.22 MB, measured as fitting at bytes / 3, counted past
// the window by the provider, refused three times. Through the real harness with scripted models: no model is called.
// The fixture is a lending library's reading room, a kind of site no realistic scenario uses.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmProviderError, runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const YES = { answersRequest: "yes", checked: [{ row: "Desk 2", column: "free", value: "yes" }], answerRecords: { asked: false } };
/** A window that holds about 900 KB at bytes / 3, and about 540 KB at the judge's conservative 1.8, less its framing. */
const LIMITS = { maxInputTokens: 300_000, maxOutputTokens: 4_000, maxTotalTokens: 304_000 };
/** A page the trail shows whole: about 200 KB of plain words. */
const page = (floor: number) => `Floor ${floor}: ` + "Desk 12 by the north windows is free on Thursday. ".repeat(4_000);

const summary = (): AutomationStudioFlowLessSummary => ({
  instructions: "Reserve a free desk in the reading room for Thursday and tell me which desk it was.",
  rows: { totalRows: 1, truncated: false, columns: [{ id: "desk", label: "Desk" }, { id: "free", label: "free" }], rows: [{ desk: "Desk 2", free: "yes" }] },
  acts: [],
  // Three different pages (an identical repeat is a reference since t978) the trail shows whole, about 600 KB, and one small answer.
  trail: [
    ...[1, 2, 3].map((floor) => ({ did: "page.read", outcome: "answered", where: `https://library.example/desks?floor=${floor}`, found: { page: page(floor) } })),
    { did: "page.read", outcome: "answered", found: { rows: 1 } }
  ]
});

function scripted(refusals: number): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "judge-model" },
      estimateCostUsd: () => 0.000_1,
      runTask: async (request) => {
        seen.push(request);
        if (seen.length <= refusals) throw new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", "The provider counted the request past the model's window.");
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: YES }, usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.000_1 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const judged = (provider: AutomationStudioLlmProvider) => automationStudioFlowLessJudge({ summary: summary(), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [], tokenLimits: LIMITS });
const sentOf = (request: AutomationStudioLlmTaskRequest | undefined) => request?.context.resultSummary as unknown as { summarised?: { items: string[] }; trail?: { entries: { found?: unknown }[] } } | undefined;

describe("the judge's request against its model's window", () => {
  it("is fitted before it is sent where bytes / 3 would have sent it whole: the page the trail found is summarised, the rest kept", async () => {
    const { provider, seen } = scripted(0);
    expect(await judged(provider)).toMatchObject({ verdict: "yes" });
    expect(seen).toHaveLength(1);
    // By the harness's own measure the whole summary fits; by the judge's it does not, so it was never sent whole.
    expect(Math.ceil(Buffer.byteLength(JSON.stringify(summary()), "utf8") / 3)).toBeLessThan(LIMITS.maxInputTokens);
    const sent = sentOf(seen[0])!;
    expect(sent.summarised?.items).toEqual(["trail.entries[0].found"]);
    expect(JSON.stringify(sent.trail?.entries[1]?.found)).toContain("north windows");
    expect(sent.trail?.entries[3]?.found).toEqual({ rows: 1 });
  });

  it("answers a provider's refusal for size with the next shorter form, and judges, instead of reading it as not judged", async () => {
    const { provider, seen } = scripted(1);
    expect(await judged(provider)).toMatchObject({ verdict: "yes" });
    expect(seen).toHaveLength(2);
    const first = JSON.stringify(sentOf(seen[0]));
    const second = JSON.stringify(sentOf(seen[1]));
    expect(second.length).toBeLessThan(first.length);
  });

  it("reads a refusal for size as not judged only once no shorter form is left", async () => {
    const { provider, seen } = scripted(1_000);
    expect(await judged(provider)).toMatchObject({ verdict: "not_judged" });
    // Every form was tried once, from the first that fit, and no more.
    expect(seen.length).toBeGreaterThan(1);
    expect(new Set(seen.map((request) => JSON.stringify(sentOf(request)))).size).toBe(seen.length);
  });
});
