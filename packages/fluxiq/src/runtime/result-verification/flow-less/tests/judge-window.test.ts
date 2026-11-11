// The Flow-less judge on a model of its own whose window is far smaller than what an attempt got (W3, t899): the
// request is built to the judging model's window, what does not fit is summarised and says so, and the check is
// judged rather than refused by size. Through the real harness with scripted models: no model is called. The fixture
// is a kind of site no realistic scenario uses (a lending library's reading room).
import { describe, expect, it } from "vitest";
import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import {
  AutomationStudioLlmProviderError,
  automationStudioLlmProviderRoutedByRole,
  automationStudioLlmProviderWithTokenLimits,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../judged-summary.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const DENIED = ["rawMarkup"];
const RESERVED: AutomationStudioAttemptAct = { id: "act.1", what: "Reserved a desk in the reading room", where: "the desks page", classes: ["create_new"], state: "landed" };
/** A desk plan of 1,500 seats, each its own line: about 90,000 characters, some 30,000 tokens by Core's measure. */
const SEATS = Array.from({ length: 1_500 }, (_, index) => `Desk ${index + 1} by the north windows, lamp and socket, ${index % 3 === 0 ? "taken" : "free"}`);
const summary = (): AutomationStudioFlowLessSummary => ({
  instructions: "Reserve a free desk in the reading room for Thursday and tell me which desk it was.",
  rows: { totalRows: 2, truncated: false, columns: [{ id: "desk", label: "Desk" }, { id: "free", label: "free" }], rows: [{ desk: "Desk 1", free: "no" }, { desk: "Desk 2", free: "yes" }] },
  acts: [RESERVED],
  answerText: "Desk 2 is reserved for Thursday.",
  endView: { after: "end", view: { lines: SEATS } },
  witnesses: { before: { seats: SEATS }, after: { seats: SEATS, reserved: "Desk 2" } }
});

/** The judging model's window, and the reply its limits set aside: the harness's own derivation of a resolution's limits. */
const SMALL = { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 };
const LARGE = { maxInputTokens: 400_000, maxOutputTokens: 8_000, maxTotalTokens: 408_000 };
const YES = { answersRequest: "yes", checked: [{ row: "Desk 2", column: "free", value: "yes" }], answerRecords: { asked: false } };

/** A model bound to a window: like an adapter, it refuses by size a request over it, and otherwise says yes. */
function model(name: string, window: number, seen: AutomationStudioLlmTaskRequest[]): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: name },
    estimateCostUsd: () => 0.000_1,
    runTask: async (request) => {
      seen.push(request);
      if (request.estimatedInputTokens + request.tokenLimits.maxOutputTokens > window) throw new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", `${name}'s window is ${window} tokens; nothing was trimmed.`);
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: YES }, usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.000_1 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
    }
  };
}

const judged = (provider: AutomationStudioLlmProvider) => automationStudioFlowLessJudge({ summary: summary(), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: DENIED });
const summaryOf = (request: AutomationStudioLlmTaskRequest | undefined) => request?.context.resultSummary as unknown as Record<string, unknown> | undefined;

describe("a judge on a model with a smaller window than the evidence", () => {
  it("is sent a request that fits its window, says what was summarised, and returns a verdict", async () => {
    const explored: AutomationStudioLlmTaskRequest[] = [];
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider = automationStudioLlmProviderRoutedByRole({ explore: model("explorer", 1_000_000, explored), judge: automationStudioLlmProviderWithTokenLimits(model("small-judge", SMALL.maxTotalTokens, seen), SMALL) });

    const judgement = await judged(provider);

    expect(judgement).toMatchObject({ verdict: "yes" });
    expect(explored).toHaveLength(0);
    expect(seen).toHaveLength(1);
    const request = seen[0]!;
    // Built to the judging model's limits, not the explorer's, and inside them.
    expect(request.tokenLimits).toEqual(SMALL);
    expect(request.context.instructions.tokenBudget).toBe(SMALL.maxInputTokens);
    expect(request.estimatedInputTokens + SMALL.maxOutputTokens).toBeLessThanOrEqual(SMALL.maxTotalTokens);
    // What was summarised, how many, and how the judge can tell: each in its own place, and named last.
    const sent = summaryOf(request)!;
    const told = sent.summarised as { count: number; items: string[]; note: string };
    expect(told.items).toEqual(["witnesses.before", "witnesses.after", "endView.view"]);
    expect(told.count).toBe(3);
    expect(told.note).toContain("core.summarised");
    expect(told.note).toContain("answer unknown");
    expect(Object.keys(sent).at(-1)).toBe("summarised");
    const witnesses = sent.witnesses as { before: Record<string, unknown>; after: Record<string, unknown> };
    expect(witnesses.before["core.summarised"]).toMatchObject({ item: "witnesses.before", kind: "object", keys: { seats: "list of 1500 entries" } });
    expect(witnesses.after["core.summarised"]).toMatchObject({ kind: "object", keys: { seats: "list of 1500 entries", reserved: "text of 6 characters" } });
    expect((sent.endView as { view: Record<string, unknown> }).view["core.summarised"]).toMatchObject({ item: "endView.view", keys: { lines: "list of 1500 entries" } });
    // Nothing else was touched: the rows, the acts and the model's words go whole.
    const whole = automationStudioFlowLessJudgedSummary(summary(), DENIED).sent as unknown as Record<string, unknown>;
    for (const key of ["recordSets", "acts", "answerText", "question", "columnLabels"]) expect(sent[key]).toEqual(whole[key]);
    expect(JSON.stringify(request.context.resultSummary)).not.toContain("north windows");
  });

  it("was refused by its own adapter and not judged while the request was built to the caller's limits", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    // The judging model's provider says nothing of its window, as before this change: the request is built to the default window.
    const provider = automationStudioLlmProviderRoutedByRole({ explore: model("explorer", 1_000_000, []), judge: model("small-judge", SMALL.maxTotalTokens, seen) });

    const judgement = await judged(provider);

    expect(judgement).toMatchObject({ verdict: "not_judged", unanswered: true });
    expect(seen).toHaveLength(1);
    expect(summaryOf(seen[0])?.summarised).toBeUndefined();
  });
});

describe("a judge whose window holds the evidence", () => {
  it("gets the evidence unchanged, exactly as an unrouted judge sends it", async () => {
    const routedSeen: AutomationStudioLlmTaskRequest[] = [];
    const plainSeen: AutomationStudioLlmTaskRequest[] = [];
    const routed = automationStudioLlmProviderRoutedByRole({ explore: model("explorer", 1_000_000, []), judge: automationStudioLlmProviderWithTokenLimits(model("large-judge", LARGE.maxTotalTokens, routedSeen), LARGE) });

    expect(await judged(routed)).toMatchObject({ verdict: "yes" });
    expect(await judged(model("large-judge", 1_000_000, plainSeen))).toMatchObject({ verdict: "yes" });

    const whole = automationStudioFlowLessJudgedSummary(summary(), DENIED).sent;
    expect(routedSeen[0]?.context.resultSummary).toEqual(whole);
    expect(summaryOf(routedSeen[0])?.summarised).toBeUndefined();
    // The same evidence, byte for byte, as a judge that is not routed at all; only the limits are the judging model's own.
    expect(JSON.stringify(routedSeen[0]?.context.resultSummary)).toBe(JSON.stringify(plainSeen[0]?.context.resultSummary));
    expect(routedSeen[0]?.tokenLimits).toEqual(LARGE);
  });
});
