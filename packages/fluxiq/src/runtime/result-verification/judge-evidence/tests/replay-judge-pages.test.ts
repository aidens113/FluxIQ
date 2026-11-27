// t1084: a judge asked on its own request sees the pages the result rests on. Live run `run-mwz29d50-c3a32a9c`, attempt
// 3: the saved Flow's replay reached the cart and read its two rows, and its judge, which continued no decider because a
// replay makes no decision (0080, `continuation: no_decision_in_this_attempt`), was shown every step as semantic state
// with the page left out. It never saw the product page's rating or its pickup line, answered unknown, and a Flow that
// had worked was repaired.
//
// Rebuilt here from the run's own step files (`./fixtures/run-mwz29d50-replay-judge.json`): the two lasting acts attempt
// 1 made and attempt 3 carried, each call as sent with the domain's answer as recorded, go through the attempt's trail
// step (`../../run-trail/of/call.ts`) and are handed on as carried acts' evidence is (`SVC/answer-first/witnesses/`); the
// replay's own steps follow, as the Flow's run records them (`../../run-trail/of/attempts.ts`); the end view is the cart
// the replay left. No model is called: the provider is scripted and only records what it was sent.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS } from "../../../llm/view-channel/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioJudgeEvidenceProjector, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioFlowLessJudge, automationStudioFlowLessJudgedSummary, type AutomationStudioFlowLessSummary } from "../../flow-less/index.ts";
import { automationStudioResultTrailOfAttempts, automationStudioResultTrailStepOfCall } from "../../run-trail/index.ts";

type Recorded = { recordedStep: number; callId: string; toolId: string; value: JsonObject; answer: JsonObject };
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures", "run-mwz29d50-replay-judge.json"), "utf8")) as { carriedCalls: Recorded[]; before: JsonObject; end: JsonObject };

/** The lines the result's conditions are checked by, on the product page attempt 1 added the roll from (0018 `page.txt`). */
const RATING = 't1415 "4.5 out of 5 Stars. 938 reviews"';
const PICKUP_TODAY = 't1431 "Today" covered-by t1609';

/** The web domain's projection, as far as it matters here: semantic state only, the page left out (`captureOmitted`). */
const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
  const held = (input.evidence as JsonObject).evidence as JsonObject | undefined;
  return { role: "observation", evidence: { ...(held?.judgeState === undefined ? {} : { state: held.judgeState }), captureOmitted: true } };
};
const SEMANTIC = { judgeEvidenceVersion: 1 as const, projectJudgeEvidence: projector, deniedEvidenceKeys: [] as string[] };

/** A carried act's entry, as `SVC/answer-first/witnesses/act-evidence.ts` copies it: without its call's id or its own attempt's settlement. */
function carried(call: Recorded): AutomationStudioResultTrailStep {
  const step = automationStudioResultTrailStepOfCall({ callId: call.callId, toolId: call.toolId, value: call.value }, { kind: "llm_evidence_tool_execution", evidence: call.answer, resultCode: "web.action.succeeded", effectApplied: true }, undefined, SEMANTIC);
  const { callId: _call, judgeSource: _source, judgeSources: _sources, judgeAct: _act, ...kept } = structuredClone(step);
  return kept;
}

/** Attempt 3's replay of the saved Flow, as 0080's trail shows its steps: the store, the search and the add passed over as already done, "View cart" passed over, the header's cart link, the read. The step files hold none of their pages. */
function replay(): AutomationStudioResultTrailStep[] {
  const node = (id: string, label: string, definitionId: string, declaredConsequences: string[] = []) => ({ id, label, definitionId, metadata: { declaredConsequences } });
  const nodes = [node("s1", "Go to the site", "web.output.browser-navigate"), node("s11", "Add to cart", "web.output.dom-click", ["modify_existing"]), node("s10", "View cart", "web.output.dom-click"), node("s15", "Cart", "web.output.dom-click"), node("s18", "Read the cart", "web.output.dom-extract_list")];
  return automationStudioResultTrailOfAttempts([
    { nodeId: "s1", attemptId: "s1.attempt.1", status: "succeeded", route: "success" },
    { nodeId: "s11", attemptId: "s11.attempt.1", status: "succeeded", route: "skipped", skipped: { reason: "already_done" } },
    { nodeId: "s10", attemptId: "s10.attempt.1", status: "succeeded", route: "skipped", skipped: { reason: "not_arisen", code: "executor.state.not_arisen" } },
    { nodeId: "s15", attemptId: "s15.attempt.1", status: "succeeded", route: "success" },
    { nodeId: "s18", attemptId: "s18.attempt.1", status: "succeeded", route: "success", outputs: { records: 2 } }
  ], nodes, ["pageView", "judgeState"], SEMANTIC);
}

const marker = (did: string): AutomationStudioResultTrailStep => ({ did, outcome: "earlier_attempt", found: "Core's marker of the carried acts' evidence." });

function summary(): AutomationStudioFlowLessSummary {
  return {
    instructions: "Add the cheapest single roll of paper towels that is rated 4.5 stars or higher and can be picked up today to my cart, then show my cart as a table with columns item, quantity and price.",
    rows: { totalRows: 2, truncated: false, columns: [{ id: "item", label: "item" }, { id: "quantity", label: "quantity" }, { id: "price", label: "price" }], rows: [{ item: "ValueRidge Ultra Dish Soap, Lemon Scent, 24 fl oz", quantity: "1", price: "$3.97" }, { item: "ValueRidge Essentials Paper Towels, 1 Roll", quantity: "1", price: "$1.28" }] },
    acts: [
      { id: "act.store", what: "Already done earlier: Set as my store", where: "On the site", classes: ["modify_existing"], state: "landed" },
      { id: "act.add", what: "Already done earlier: Add to cart", where: "On the site", classes: ["modify_existing"], state: "landed" }
    ],
    endView: { view: fixture.end },
    witnesses: { before: fixture.before, after: fixture.end },
    trail: [marker("core.carried_acts_evidence"), ...fixture.carriedCalls.map(carried), marker("core.carried_acts_evidence_end"), ...replay()]
  };
}

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "claude-sonnet-5-5" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "unknown", observed: "Scripted." } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const judged = async (continuesDecider: boolean): Promise<JsonObject> => {
  const { provider, seen } = scripted();
  await automationStudioFlowLessJudge({ summary: summary(), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", ...SEMANTIC, ...(continuesDecider ? { continuesDecider: true } : {}) });
  expect(seen).toHaveLength(1);
  return seen[0]!.context.resultSummary as unknown as JsonObject;
};

describe("the replay judge of run-mwz29d50-c3a32a9c, asked on its own request", () => {
  it("is shown the product page's rating and pickup line, from the carried act's own answer, within the page budget", async () => {
    const sent = await judged(false);
    const pages = sent.pageViews as JsonObject;
    expect(Object.keys(sent).at(-1)).toBe("pageViews");
    const texts = Object.entries(pages).filter(([name]) => name !== "note").map(([name, view]) => [name, (view as JsonObject).text as string] as const);
    // The end view (the cart), the before view (the home page before the first act), then the page "Add to cart" was pressed on.
    expect(texts.map(([name]) => name).slice(0, 3)).toEqual(["endView", "witnesses.before", "trail.3"]);
    const product = texts.find(([name]) => name === "trail.3")![1];
    expect(product.split("\n")).toContain(RATING);
    expect(product.split("\n")).toContain(PICKUP_TODAY);
    expect(texts.reduce((size, [, text]) => size + text.length, 0)).toBeLessThanOrEqual(AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS);
    // Whole lines only, and what did not fit is said.
    for (const [, view] of Object.entries(pages).filter(([name]) => name !== "note")) {
      const shown = view as JsonObject;
      if ((shown.text as string).length === 0) expect(shown.linesNotShown).toBeGreaterThan(0);
    }
  });

  it("is what today's request lacked: the trail it is shown still holds no page", async () => {
    const sent = await judged(false);
    const { pageViews: _pages, ...rest } = sent;
    expect(JSON.stringify(rest)).not.toContain("938 reviews");
    expect(JSON.stringify(rest)).toContain("captureOmitted");
  });

  it("leaves the deciding digest's copy as it was, and gives a judge marked as continuing the same views", async () => {
    const { sent } = automationStudioFlowLessJudgedSummary(summary(), [], { judgeEvidenceVersion: 1, projectJudgeEvidence: projector });
    expect(sent).not.toHaveProperty("pageViews");
    expect(JSON.stringify(sent)).not.toContain("938 reviews");
    // A judge marked as continuing carries the same views (t1089): its provider leaves them out only where it really continues.
    const continuing = await judged(true);
    expect(continuing.pageViews).toEqual((await judged(false)).pageViews);
    expect(Object.keys(continuing).at(-1)).toBe("pageViews");
  });
});
