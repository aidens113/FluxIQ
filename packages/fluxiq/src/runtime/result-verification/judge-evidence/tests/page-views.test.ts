// A judge asked on its own request is shown the pages a judge needs (t1067, t1084): the end view, the before view where a
// lasting act ran, and the pages the trail's acts were pressed on and its steps landed on, as the model read them, within
// the page budget. Live run run-mwy3btww-31d32e0d's standalone judges were shown every view as semantic state only
// (`captureOmitted`) and said unsure for want of what the page showed, and run-mwz29d50-c3a32a9c's replay judge, which
// continued no decider, could not see the product page the item was chosen on. A judge that never continues the decider
// carries them from its first ask, last; a re-ask after an unreadable reply keeps them where they were, before its note.
// The deciding digest's view of the summary is unchanged. No model is called; the provider is scripted. The site is a
// kind no realistic scenario uses (a garden centre).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioLlmProviderError, runAutomationStudioLlmHarness, type AutomationStudioJudgeEvidenceProjector, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioFlowLessJudge, automationStudioFlowLessJudgedSummary, type AutomationStudioFlowLessSummary } from "../../flow-less/index.ts";
import { AutomationStudioJudgePageViews } from "../index.ts";

/** A page view as a domain hands it: a page key and keyed lines (`runtime/llm/view-channel/view.ts`). */
const view = (key: string, texts: readonly string[]): JsonObject => ({ pageView: { key, lines: texts.map((text, at) => ({ key: `k${at}`, text })) }, judgeState: { title: key } });

const BASKET = view("https://garden.test/basket", ['PAGE "Basket - Garden"', 't20 "Watering Can, 5 L"', 't21 "Seed Tray, 24 Cells"', 't22 "$2.15 each"', 't23 select "Qty" ="1"']);
const HOME = view("https://garden.test/", ['PAGE "Garden centre"', 't1 button "Choose your store"']);

/** The domain's projection: semantic state only, the page left out, as the web domain's is. */
const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
  const held = (input.evidence as JsonObject).evidence as JsonObject | undefined;
  return { role: "observation", evidence: { ...(held?.judgeState === undefined ? {} : { state: held.judgeState }), captureOmitted: true } };
};

const summary = (): AutomationStudioFlowLessSummary => ({
  instructions: "Add the cheapest seed tray that can be collected today, rated 4.5 or higher, and show my basket as a table with columns item and price.",
  rows: { totalRows: 2, truncated: false, columns: [{ id: "item", label: "item" }, { id: "price", label: "price" }], rows: [{ item: "Watering Can, 5 L", price: "$8.00" }, { item: "Seed Tray, 24 Cells", price: "$2.15" }] },
  acts: [{ id: "act.add", what: "+ Add", where: "On the site", classes: ["modify_existing"], state: "landed" }],
  endView: { view: BASKET },
  witnesses: { before: HOME, after: BASKET }
});

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "claude-sonnet-5-5" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        if (seen.length === 1) throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200, undefined, undefined, undefined, { case: "content_prefixed" });
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "unknown", observed: "Scripted." } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

describe("a judge asked on its own request after an unreadable reply", () => {
  it("is shown the end view's page and the before view's, as the decider read them, from its first ask on", async () => {
    const { provider, seen } = scripted();
    // A judge that never continues the decider: every ask is its own request.
    await automationStudioFlowLessJudge({ summary: summary(), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [], judgeEvidenceVersion: 1, projectJudgeEvidence: projector });
    expect(seen).toHaveLength(2);
    const first = seen[0]!.context.resultSummary as unknown as JsonObject;
    expect(Object.keys(first).at(-1)).toBe("pageViews");
    expect(((first.pageViews as JsonObject).endView as JsonObject).text).toBe(BASKET_TEXT);
    const standalone = seen[1]!.context.resultSummary as unknown as JsonObject;
    expect(seen[1]!.metadata).not.toHaveProperty("continuesDecider");
    expect(seen[1]!.metadata).not.toHaveProperty("judgeAnswersInConversation");
    const pages = standalone.pageViews as JsonObject;
    expect((pages.endView as JsonObject).text).toBe(BASKET_TEXT);
    expect((pages["witnesses.before"] as JsonObject).text).toBe(HOME_TEXT);
    // The after witness is the end view again: shown once.
    expect(pages).not.toHaveProperty("witnesses.after");
    expect(Object.keys(standalone).slice(-2)).toEqual(["pageViews", "unreadableReply"]);
    // The re-ask's bytes before its note are the first ask's.
    const { unreadableReply: _note, ...asked } = standalone;
    expect(JSON.stringify(asked)).toBe(JSON.stringify(first));
  });

  it("is not shown them on a first ask that continues the decider, which reads the pages in its conversation", async () => {
    const { provider, seen } = scripted();
    await automationStudioFlowLessJudge({ summary: summary(), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [], judgeEvidenceVersion: 1, projectJudgeEvidence: projector, continuesDecider: true });
    const first = seen[0]!.context.resultSummary as unknown as JsonObject;
    expect(first).not.toHaveProperty("pageViews");
    expect(JSON.stringify(first)).not.toContain("t21 ");
  });

  it("is shown nothing the deciding digest compares: the judge's summary itself holds no page", () => {
    const { sent } = automationStudioFlowLessJudgedSummary(summary(), [], { judgeEvidenceVersion: 1, projectJudgeEvidence: projector });
    expect(JSON.stringify(sent)).not.toContain("t21 ");
    expect(sent).not.toHaveProperty("pageViews");
    expect(AutomationStudioJudgePageViews.of(sent)).toMatchObject({ endView: { text: BASKET_TEXT } });
  });
});

describe("the page views, within the page budget", () => {
  it("share one budget in order, each whole while it fits, and say how many lines did not", () => {
    const end = { view: view("https://garden.test/basket", ["a".repeat(30), "b".repeat(30), "c".repeat(30)]) };
    const before = view("https://garden.test/search", ["d".repeat(30), "e".repeat(30)]);
    const shown = AutomationStudioJudgePageViews.read({ endView: end, witnesses: { before } }, true, [], 70)!;
    expect(shown.endView).toEqual({ text: `${"a".repeat(30)}\n${"b".repeat(30)}`, linesNotShown: 1 });
    expect(shown["witnesses.before"]).toEqual({ text: "", linesNotShown: 2 });
  });

  it("leave the before view out where no lasting act ran", () => {
    const shown = AutomationStudioJudgePageViews.read({ endView: { view: BASKET }, witnesses: { before: HOME } }, false, [])!;
    expect(shown).not.toHaveProperty("witnesses.before");
    expect(shown.endView).toEqual({ text: BASKET_TEXT });
  });

  it("screen the page as every value sent to a judge is", () => {
    const secret = view("https://garden.test/account", ["t1 \"api key sk-ant-api03-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJ\""]);
    const shown = AutomationStudioJudgePageViews.read({ endView: { view: secret } }, false, [])!;
    expect(JSON.stringify(shown)).not.toContain("sk-ant-api03-0123456789");
  });
});

const BASKET_TEXT = ['PAGE "Basket - Garden"', 't20 "Watering Can, 5 L"', 't21 "Seed Tray, 24 Cells"', 't22 "$2.15 each"', 't23 select "Qty" ="1"'].join("\n");
const HOME_TEXT = ['PAGE "Garden centre"', 't1 button "Choose your store"'].join("\n");
