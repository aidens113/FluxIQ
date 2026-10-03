// The page a build's test ended on, for its judge (run `run-murwd8le-79e735a8`,
// Cause 7). Judges 0046, 0047 and 0069 were shown each step's outcome word and
// nothing of the page the test left, which carried the site's answer to the
// test's Add to cart ("You have reached the purchase limit for this item.").
// 0069 then assumed a colour was pre-selected that the page showed was not.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummaryWithEndView } from "../../result-summary.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { DENIED, SITE, navigate, replayed, report, web } from "./draft-steps.ts";

/** The web domain's declared view keys, as it declares them to Core. */
const VIEW_KEYS = ["elements", "dialogs", "blockedBy", "page"];
const PAGE = "PAGE \"Voltbay USB C Hub\"\nt885 link \"3 Cart\" ~/cart\nt968 \"You have reached the purchase limit for this item.\"";

const open = navigate(1);
const add = web(2, "web.output.dom-click", { selector: "[data-testid=\"add-to-cart\"]", visibleText: "Add to cart" }, SITE);
const steps = [open, add];

const summaryOf = (observed: Parameters<typeof report>[1], extra: Partial<Parameters<typeof automationStudioBuildTestResultSummary>[0]> = {}): AutomationStudioRunResultSummaryWithEndView =>
  automationStudioBuildTestResultSummary({
    steps, report: report(steps.map(replayed), observed), nodes: [], instructionText: "Put three of the hub in my cart.",
    startLocation: SITE, deniedEvidenceKeys: DENIED, observedStateKeys: VIEW_KEYS, ...extra
  });

describe("the page a build's test ended on", () => {
  it("is the last step's view, sent once beside the steps and taken out of the step's observation", () => {
    const summary = summaryOf([[add, { ok: true, code: "core.replay.remembered", said: "the step ran again", location: SITE, page: PAGE }]]);
    expect(summary.endView).toEqual({ after: 2, view: { page: PAGE } });
    expect(JSON.stringify(summary.buildTest)).not.toContain("purchase limit");
  });

  it("is not an earlier step's view: when the last answer carried none, no page is held for the end", () => {
    const summary = summaryOf([[open, { ok: true, code: "core.replay.replayed", said: "went there", page: PAGE }], [add, { ok: true, code: "core.replay.replayed", said: "the step ran again" }]]);
    expect(summary.endView).toBeUndefined();
  });

  it("is the page the caller captured at the end of the test, where it captured one", () => {
    const summary = summaryOf([[add, { ok: true, code: "core.replay.replayed", said: "the step ran again" }]], { endView: { view: { page: PAGE }, after: 2 } });
    expect(summary.endView).toEqual({ after: 2, view: { page: PAGE } });
  });

  it("is not carried without the domain's declared keys", () => {
    const summary = summaryOf([[add, { ok: true, page: PAGE }]], { deniedEvidenceKeys: undefined });
    expect(summary.endView).toBeUndefined();
    expect(summary.withheld).toBe(true);
  });

  it("reaches the judge's request, and the request's evidence check lets it through", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } };
      }
    };
    const instruction: AutomationStudioFlowInstruction = {
      schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: "Put three of the hub in my cart.",
      scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
    };
    const summary = summaryOf([[add, { ok: true, code: "core.replay.remembered", said: "the step ran again", page: PAGE }]]);
    const verdict = await automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project-1", flowId: "flow-1", provider })({ summary, budget: { maxCostUsd: 1 } });
    expect(verdict.verdict).toBe("yes");
    expect((seen[0]?.context.resultSummary as AutomationStudioRunResultSummaryWithEndView | undefined)?.endView).toEqual({ after: 2, view: { page: PAGE } });
  });
});
