// What the judge of a build's test is sent, measured on a real build (t195-w28a).
//
// `run-36-test.json` is live run 36's Flow (`build-2026-10-01T22-30-40-711Z`):
// eleven steps, each with the draft the build kept and, as the test's
// observation, the tool result the run recorded for it -- page view and all.
// Sent whole, the judge's request was 28,214 characters, 17,816 of them six
// page views. With the domain's view keys out, Core's bookkeeping out, and text
// another step sent named rather than repeated (`../observation.ts`), it was
// 8,113. Since t174-w87 the one view the test ended on -- step 11's -- is sent
// once beside the steps (`endView`), because a judge without the page invents
// what it shows (run `run-murwd8le-79e735a8`, Cause 7): 11,158. No model is
// called: the provider is scripted and only captures.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";
import type { AutomationStudioRunResultSummaryWithEndView } from "../../result-summary.ts";
import { automationStudioBuildTestResultSummary, type AutomationStudioBuildTestReportInput } from "../summary.ts";
import { DENIED } from "./draft-steps.ts";
import { ACCEPT_FRIENDS } from "./live-run-drafts.ts";

/** The web domain's declared view keys, as it declares them to Core. */
const VIEW_KEYS = ["elements", "dialogs", "blockedBy", "page"];

/**
 * The bound, and why. The cut request is 11,158 characters: 8,113 for the
 * steps, and one page view, the one the test ended on. One page view of this
 * Flow's pages is 2,845 to 3,019, so any one observation that carries its view
 * again, or a second end view, puts the request past 14,000, while a sentence
 * more of the domain's own read account or a longer run id does not.
 */
const BOUND = 14_000;

type Fixture = { startLocation: string; result: JsonObject; steps: AutomationStudioFlowDraftStep[]; report: AutomationStudioBuildTestReportInput };
const fixture = JSON.parse(readFileSync(new URL("./run-36-test.json", import.meta.url), "utf8")) as Fixture;

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: ACCEPT_FRIENDS,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

async function requestSent(observedStateKeys?: readonly string[]): Promise<AutomationStudioLlmTaskRequest> {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      seen.push(request);
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } };
    }
  };
  const summary = automationStudioBuildTestResultSummary({
    steps: fixture.steps, report: fixture.report, nodes: [], instructionText: ACCEPT_FRIENDS, result: fixture.result,
    startLocation: fixture.startLocation, deniedEvidenceKeys: DENIED, ...(observedStateKeys ? { observedStateKeys } : {})
  });
  await automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project-1", flowId: "flow-1", provider })({ summary, budget: { maxCostUsd: 1 } });
  // A yes is confirmed by a second call with the same evidence (`../judge.ts`, live run murwcmx2).
  expect(seen).toHaveLength(2);
  expect(seen[1]?.context).toEqual(seen[0]?.context);
  return seen[0]!;
}

const observed = (request: AutomationStudioLlmTaskRequest, step: number): JsonObject =>
  request.context.resultSummary?.buildTest?.steps.find((item) => item.step === step)?.observed as JsonObject;

describe("the judge's request on run 36's test", () => {
  it("stays under its bound, which the views the domain declared would take it far past", async () => {
    const lean = JSON.stringify(await requestSent(VIEW_KEYS)).length;
    // With every other cut and no view key declared it is 23,089: the views
    // two steps share are named, and the four that differ are sent.
    const viewed = JSON.stringify(await requestSent()).length;
    expect(lean).toBeLessThan(BOUND);
    expect(viewed).toBeGreaterThan(BOUND + 2 * 3_019);
  });

  it("sends the page the test ended on once, beside the steps: the last step's view and no other", async () => {
    const request = await requestSent(VIEW_KEYS);
    const ended = (request.context.resultSummary as AutomationStudioRunResultSummaryWithEndView | undefined)?.endView;
    const last = fixture.report.observations.at(-1)!;
    expect(ended).toEqual({ after: 11, view: { page: (last.evidence as JsonObject).page } });
    // A page view's second line, as JSON writes it: one view in the whole request.
    expect(JSON.stringify(request).split("\\nURL ").length - 1).toBe(1);
  });

  it("sends no observation with a page view or Core's bookkeeping in it", async () => {
    const request = await requestSent(VIEW_KEYS);
    for (const step of request.context.resultSummary?.buildTest?.steps ?? []) {
      if (!step.observed) continue;
      for (const key of VIEW_KEYS) expect(step.observed).not.toHaveProperty(key);
      const text = JSON.stringify(step.observed);
      expect(text).not.toMatch(/"schemaVersion"|"commandId"|"startedAt"|"finishedAt"/u);
      // The node's own id is the step's action, said once beside it.
      expect(text).not.toContain(`"${step.action}"`);
    }
  });

  it("keeps what the verdict reads: every read's rows, its validation, and a check's control", async () => {
    const request = await requestSent(VIEW_KEYS);
    expect(observed(request, 6)).toMatchObject({ read: { extracted: [{ name: "Amara Osei", mutual: "23 mutual friends" }], extraction: { itemsSeen: 4 } } });
    const accepted = observed(request, 11) as { read: { extracted: JsonObject[]; validation: { actual: string } } };
    expect(accepted.read.extracted.map((row) => row.name)).toEqual(["Tom Becker", "Amara Osei", "Priya Nair", "Jonas Weber"]);
    expect(accepted.read.validation.actual).toContain("returned unfiltered");
    expect(observed(request, 7)).toMatchObject({ control: "Confirm", status: "succeeded" });
  });

  it("names text an earlier step already sent rather than sending it again, and never inside a list", async () => {
    const request = await requestSent(VIEW_KEYS);
    expect(observed(request, 7)).toMatchObject({ location: "as step 6", read: { url: "as step 6" } });
    expect(observed(request, 11)).toMatchObject({ read: { rejectedRowsNote: "as step 6" } });
    // Step 11's rejected rows repeat step 6's, and stay rows.
    expect(JSON.stringify(observed(request, 11))).toContain("\"rowsAlone\":[{\"name\":\"Tom Becker\"");
  });

  it("gives each step its own words without a handle or the domain's minted field keys", async () => {
    const request = await requestSent(VIEW_KEYS);
    const steps = request.context.resultSummary?.buildTest?.steps ?? [];
    expect(steps.find((step) => step.step === 6)?.target).toEqual(["(?:[5-9]|[1-9][0-9]+) mutual"]);
    expect(steps.find((step) => step.step === 11)?.target).toEqual(["Request accepted"]);
    expect(steps.find((step) => step.step === 7)?.target).toContain("Amara Osei23 mutual friends3d");
  });
});
