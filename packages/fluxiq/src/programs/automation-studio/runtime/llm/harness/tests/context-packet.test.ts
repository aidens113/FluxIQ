import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop.ts";
import {
  isAutomationStudioLlmRecentActionContext,
  packAutomationStudioLlmContext,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmHarnessInput,
  type AutomationStudioLlmProvider
} from "../index.ts";

// C-7b. An evidence-loop decision carries everything the loop has gathered so
// far, and during a recovery's exploration that is whatever the bound domain's
// options returned. It is held to the domain's declared keys like every other
// piece of evidence, and in the way failure evidence is: a request carrying a
// denied key is refused while it is being built, so nothing is sent at all.

const WEB_DENIED_EVIDENCE_KEYS = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;
const PRIVATE = "PRIVATE-RAW-PAYLOAD";

describe("packing an evidence-loop decision", () => {
  it("refuses a decision whose gathered evidence carries a key the bound domain denies, at any depth and in any spelling", () => {
    const values: JsonValue[] = [
      { schemaVersion: "web-llm-evidence.v2", html: PRIVATE },
      { schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", inner_html: PRIVATE }] },
      [{ frames: [{ OuterHTML: PRIVATE }] }],
      { page: { Selector: PRIVATE } },
      { request: { "page-source": PRIVATE } }
    ];
    for (const value of values) {
      const input = decision([clean(), { callId: "call.2", toolId: "web.recovery.inspect", value }]);
      expect(() => packAutomationStudioLlmContext(input), JSON.stringify(value)).toThrow(/denies/);
      try {
        packAutomationStudioLlmContext(input);
      } catch (error) {
        expect(String(error)).not.toContain(PRIVATE);
      }
    }
  });

  it("carries gathered evidence free of denied keys exactly, as a copy", () => {
    const input = decision([clean()]);
    const packed = packAutomationStudioLlmContext(input);
    expect(packed.evidenceLoop).toEqual(input.evidenceLoop);
    expect(packed.evidenceLoop).not.toBe(input.evidenceLoop);
    expect(packed.evidenceLoop?.evidence[0]).not.toBe(input.evidenceLoop?.evidence[0]);
    // A denied key is a key: the same word as a value is page text.
    const asText = decision([{ callId: "call.1", toolId: "web.recovery.inspect", value: { schemaVersion: "web-llm-evidence.v2", note: "the selector and the html of the cookies banner" } }]);
    expect(packAutomationStudioLlmContext(asText).evidenceLoop?.evidence).toHaveLength(1);
  });

  it("refuses gathered evidence the bound domain declared nothing about, and never reads the absence as an empty list", () => {
    const { deniedEvidenceKeys: _declared, ...undeclared } = decision([clean()]);
    expect(() => packAutomationStudioLlmContext(undeclared)).toThrow(/declared deniedEvidenceKeys/);
    // Nothing gathered yet is nothing carried, so the first decision of a loop
    // needs no declaration; the second one does.
    const { deniedEvidenceKeys: _none, ...first } = decision([]);
    expect(packAutomationStudioLlmContext(first).evidenceLoop?.evidence).toEqual([]);
    // A domain with nothing to deny says so, and its evidence is carried.
    expect(packAutomationStudioLlmContext({ ...decision([{ callId: "call.1", toolId: "t", value: { html: "declared as allowed" } }]), deniedEvidenceKeys: [] }).evidenceLoop?.evidence).toHaveLength(1);
  });

  it("never calls the provider with a refused decision", async () => {
    const asked: unknown[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "recording" },
      runTask: async (request) => {
        asked.push(request);
        return { response: { kind: "evidence_tool_decision", summary: "Done.", decision: { kind: "complete", result: {} } } };
      }
    };
    const refused = decision([clean(), { callId: "call.2", toolId: "web.recovery.inspect", value: { cookies: PRIVATE } }]);
    await expect(runAutomationStudioLlmHarness({ ...refused, provider })).rejects.toThrow(/denies/);
    expect(asked).toEqual([]);

    const allowed = await runAutomationStudioLlmHarness({ ...decision([clean()]), provider });
    expect(allowed.ok).toBe(true);
    expect(asked).toHaveLength(1);
    expect(allowed.request.deniedEvidenceKeys).toEqual(WEB_DENIED_EVIDENCE_KEYS);
  });
});

function clean(): { callId: string; toolId: string; value: JsonValue } {
  return { callId: "call.1", toolId: "web.recovery.inspect", value: { schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", tag: "button", name: "Place order" }] } };
}

function decision(evidence: Array<{ callId: string; toolId: string; value: JsonValue }>): AutomationStudioLlmHarnessInput & { deniedEvidenceKeys: readonly string[] } {
  const tools = [{ toolId: "web.recovery.inspect", description: "Look at the page as it is now.", inputSchema: { type: "object" } }];
  const completionSchema = { type: "object" };
  return {
    taskKind: "evidence_tool_decision",
    projectId: "project.one",
    flowId: "flow.one",
    runId: "run.one",
    instructions: [],
    deniedEvidenceKeys: WEB_DENIED_EVIDENCE_KEYS,
    evidenceLoop: {
      iteration: evidence.length + 1,
      tools,
      evidence,
      decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true),
      completionSchema,
      canComplete: true
    }
  };
}

// t486 (run-mv62icw0, defect 4): a step the run passed over is never shown to
// the result check as an act it performed. Playback could not find "Set as my
// store" because the site already remembered the store, and passed it over on
// the page's evidence; the check read the bare `status: succeeded` as the step
// "succeeding on the third" attempt. The recent action now says the step was
// passed over, why, and the state evidence it counts as done on.
describe("a recent action the run passed over", () => {
  const base = { definitionId: "web.output.dom-click", startedAt: 1 };
  const attempts: AutomationStudioFlowRunActionAttemptRecord[] = [
    { ...base, attemptId: "s5.attempt.1", nodeId: "s5", order: 1, status: "failed", route: "failed", comparisonStatus: "target_not_found", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" }, stateRouting: { outcome: "no_match", code: "web.target.not_found" } },
    { ...base, attemptId: "s5.attempt.2", nodeId: "s5", order: 2, status: "succeeded", route: "state_routed", comparisonStatus: "target_not_found", skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "s6", direction: "forward" }, stateRouting: { outcome: "effect_holds" } },
    { ...base, attemptId: "s7.attempt.3", nodeId: "s7", order: 3, status: "succeeded", route: "state_routed", skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "s9", direction: "forward" }, stateRouting: { outcome: "routed" } },
    { ...base, attemptId: "s9.attempt.4", nodeId: "s9", order: 4, status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found", notDone: true } },
    { ...base, attemptId: "s10.attempt.5", nodeId: "s10", order: 5, status: "succeeded", route: "success", skipped: { reason: "already_done", code: "executor.act.already_done", attemptId: "s10.attempt.1", row: "Lin Zhao" } },
    { ...base, attemptId: "s11.attempt.6", nodeId: "s11", order: 6, status: "succeeded", route: "success", failure: { category: "unexpected_state", code: "web.step.refused", retryable: true, stage: "execution" }, stateHeld: { rung: "skip_satisfied_node" } },
    { ...base, attemptId: "s12.attempt.7", nodeId: "s12", order: 7, status: "succeeded", route: "success" }
  ];

  function verification(): AutomationStudioLlmHarnessInput {
    const runDetail: AutomationStudioFlowRunDetail = {
      schemaVersion: "0.1",
      summary: { schemaVersion: "0.1", runId: "run.one", flowId: "flow.one", projectId: "project.one", status: "succeeded", updatedAt: 1, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: attempts.length, interventionCount: 0, adaptationCount: 0 },
      actionAttempts: attempts,
      routeDecisions: [],
      subflows: [],
      recoveryAttempts: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    };
    return {
      taskKind: "loop_verification",
      projectId: "project.one",
      flowId: "flow.one",
      runId: "run.one",
      instructions: [],
      deniedEvidenceKeys: [],
      runDetail
    };
  }

  it("says a step whose own effect was already on the page was satisfied by state, did not act, and on what evidence", () => {
    const actions = packAutomationStudioLlmContext(verification()).recentActions ?? [];
    const byId = new Map(actions.map((action) => [action.attemptId, action]));
    expect(byId.get("s5.attempt.2")).toMatchObject({
      status: "succeeded",
      route: "state_routed",
      acted: false,
      skipped: { reason: "state_routed", toNodeId: "s6", direction: "forward" },
      satisfiedByState: "page_showed_step_effect"
    });
    // Passed over because the page matched a later step's start: not done by state.
    expect(byId.get("s7.attempt.3")).toMatchObject({ acted: false, skipped: { reason: "state_routed", toNodeId: "s9", direction: "forward" } });
    expect(byId.get("s7.attempt.3")).not.toHaveProperty("satisfiedByState");
    expect(byId.get("s9.attempt.4")).toMatchObject({ acted: false, skipped: { reason: "target_absent", notDone: true } });
    expect(byId.get("s10.attempt.5")).toMatchObject({ acted: false, skipped: { reason: "already_done", doneByAttemptId: "s10.attempt.1" } });
    // A failed step whose recorded state already held counts as done on that state; whether it acted is not known.
    expect(byId.get("s11.attempt.6")).toMatchObject({ satisfiedByState: "recorded_state_held", failureCategory: "unexpected_state" });
    expect(byId.get("s11.attempt.6")).not.toHaveProperty("acted");
    expect(byId.get("s11.attempt.6")).not.toHaveProperty("skipped");
    // A step that ran is untouched.
    expect(byId.get("s12.attempt.7")).not.toHaveProperty("acted");
    expect(byId.get("s12.attempt.7")).not.toHaveProperty("skipped");
    expect(byId.get("s12.attempt.7")).not.toHaveProperty("satisfiedByState");
    // Ids and closed words only: a row's label and a Core code never travel.
    expect(JSON.stringify(actions)).not.toContain("Lin Zhao");
    expect(JSON.stringify(actions)).not.toContain("web.target.not_found");
    for (const action of actions) expect(isAutomationStudioLlmRecentActionContext(action), action.attemptId).toBe(true);
  });

  it("refuses a recent action whose pass-over record the projection could not have produced", () => {
    const passed = packAutomationStudioLlmContext(verification()).recentActions!.find((action) => action.attemptId === "s5.attempt.2")!;
    expect(isAutomationStudioLlmRecentActionContext(passed)).toBe(true);
    const forged: unknown[] = [
      { ...passed, acted: true },
      { ...passed, satisfiedByState: "the store was already Millbrook" },
      { ...passed, skipped: { reason: "state_routed", toNodeId: "s6", direction: "sideways" } },
      { ...passed, skipped: { reason: "state_routed", toNodeId: "s6", direction: "forward", row: "Lin Zhao" } },
      { ...passed, skipped: { reason: "already_done" } },
      { ...passed, skipped: "state_routed" }
    ];
    for (const action of forged) expect(isAutomationStudioLlmRecentActionContext(action), JSON.stringify(action)).toBe(false);
  });
});
