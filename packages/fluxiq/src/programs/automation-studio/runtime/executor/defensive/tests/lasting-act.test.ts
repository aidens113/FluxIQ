// Which acts last, and what the policy does with one whose effect is unknown (t359).

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioAssessAttemptFault, automationStudioContinuationAfterFailure, automationStudioNodeActLasts, automationStudioStopMessage } from "../index.ts";

function webNode(metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode {
  return { id: "add", definitionId: "web.output.dom-click", ...(metadata ? { metadata } : {}) };
}

function failed(failure: AutomationStudioFailureRecord): AutomationStudioNodeAttemptTrace {
  return { attemptId: "add.attempt.1", nodeId: "add", definitionId: "web.output.dom-click", startedAt: 1, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], failure };
}

const AFTER_DISPATCH: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.failed", retryable: true, stage: "execution" };
const LOST_CONFIRMATION: AutomationStudioFailureRecord = { category: "output_not_observed", code: "web.validation.output_not_observed", retryable: true, stage: "verification" };
const NOT_FOUND: AutomationStudioFailureRecord = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" };
const BUSY: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" };

describe("whether a node's act lasts", () => {
  it("reads the step's declared consequences, where an empty declaration is the step saying none", () => {
    expect(automationStudioNodeActLasts(webNode({ declaredConsequences: ["create_new"] }))).toBe(true);
    expect(automationStudioNodeActLasts(webNode({ declaredConsequences: [] }))).toBe(false);
    expect(automationStudioNodeActLasts(webNode())).toBe(false);
  });

  it("counts a node marked as acting on the world, and never one that says repeating it is safe", () => {
    expect(automationStudioNodeActLasts(webNode({ effect: "mutate" }))).toBe(true);
    expect(automationStudioNodeActLasts(webNode({ declaredConsequences: ["send_or_publish"], idempotent: true }))).toBe(false);
  });
});

describe("a failed lasting act", () => {
  const lasting = webNode({ declaredConsequences: ["create_new"] });

  it("is refused as uncertain when the failure does not show it did not happen", () => {
    for (const failure of [AFTER_DISPATCH, LOST_CONFIRMATION]) {
      const assessed = automationStudioAssessAttemptFault(failed(failure), lasting);
      expect(assessed).toMatchObject({ disposition: "refuse", actUncertain: true, effect: "ambiguous" });
      expect(assessed?.reason).toContain("add makes a lasting act");
    }
  });

  it("keeps its retries when the failure shows it did not happen", () => {
    for (const failure of [NOT_FOUND, BUSY]) {
      const assessed = automationStudioAssessAttemptFault(failed(failure), lasting);
      expect(assessed?.disposition).toBe("retry");
      expect(assessed?.actUncertain).toBeUndefined();
    }
  });

  it("is heard from the producer when the node declares nothing", () => {
    expect(automationStudioAssessAttemptFault(failed({ ...AFTER_DISPATCH, effect: "ambiguous" }), webNode())).toMatchObject({ disposition: "refuse", actUncertain: true });
    expect(automationStudioAssessAttemptFault(failed(AFTER_DISPATCH), webNode())?.disposition).toBe("retry");
  });

  it("stops a Flow that would walk past it, and says the outcome is uncertain", () => {
    const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "f", ownerKind: "routine", ownerId: "r", name: "F", createdAt: 1, updatedAt: 1, nodes: [lasting], edges: [] };
    const assessed = automationStudioAssessAttemptFault(failed(AFTER_DISPATCH), lasting);
    expect(automationStudioContinuationAfterFailure(flow, lasting, assessed)).toMatchObject({ continues: false });
    expect(automationStudioStopMessage(assessed, "The press failed.")).toMatch(/^Outcome uncertain: add makes a lasting act.* The press failed\.$/u);
    expect(automationStudioStopMessage({ reason: "busy" }, "The press failed.")).toBe("The press failed.");
  });
});
