// What the model is told when a passed trial met a slow-down (P6, CC8, t799):
// a pace is Core's to write, so the instruction no longer asks for `repeat pace:`
// for it; it says what Core does, and what the model must still do. The rule
// itself, that a yes the site asked to slow down completes only once the Flow
// answers it, stays (`../../trial-gate-slow-down.test.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { automationStudioCandidateTrialSlowDown } from "../../../trial-slow-down.ts";
import type { AutomationStudioFlowCandidate } from "../../../index.ts";

const CLICK = "web.output.dom-click";

function candidate(paceMs?: number): AutomationStudioFlowCandidate {
  const nodes = [{ key: "renew", definitionId: CLICK, definitionVersion: "1.0.0", label: "renew the loan", ...(paceMs ? { paceMs } : {}) }];
  const subflow = { key: "primary", name: "Primary", role: "primary" as const, nodes, edges: [] };
  return { revision: 1, digest: "d", baseDependencyDigest: "b", status: "draft", summary: "Renew", changedPaths: [],
    buildPlan: { plan: { schemaVersion: "0.1", router: { name: "Renew", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [subflow] }, risk: "low", subflows: [{ ...subflow, nodes: nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } })) }] } };
}

const feedback = (interruption?: JsonObject): JsonObject => ({
  steps: [{ step: 3, definitionId: CLICK, label: "renew the loan", status: "succeeded", ...(interruption ? { interruptions: [interruption] } : {}) }],
  paces: [{ definitionId: CLICK, label: "renew the loan", paceMs: 2_050, said: "..." }]
});

describe("the slow-down instruction", () => {
  it("says Core writes the pace, asks for no repeat pace line, and asks only to submit and test again", () => {
    const unhandled = automationStudioCandidateTrialSlowDown.unhandled(feedback(), candidate());
    const words = automationStudioCandidateTrialSlowDown.instruction(unhandled);

    expect(unhandled).toEqual([{ step: 3, label: "renew the loan", paceAtLeastMs: 2_050 }]);
    expect(words).toContain("Core sets its pace to at least 2.1 s itself when the whole candidate is submitted again");
    expect(words).toContain("write no `repeat pace:` for it");
    expect(words).toContain("Submit the whole candidate again, then test the new revision, and complete only after a yes for it.");
    expect(words).not.toContain("Change the Flow");
  });

  it("still asks the model for the dismiss-and-wait step Core cannot write", () => {
    const words = automationStudioCandidateTrialSlowDown.instruction(automationStudioCandidateTrialSlowDown.unhandled(feedback({ kind: "rate_limit", wayOut: "t30" }), candidate()));

    expect(words).toContain("Core sets its pace to at least 2.1 s itself");
    expect(words).toContain("it also needs right after it, inside the span, an `optional: yes` step that presses t30");
    expect(words).toContain("Change the Flow, submit the whole candidate, then test the new revision");
  });

  it("asks for nothing once the Flow carries a pace that reaches the one learned", () => {
    expect(automationStudioCandidateTrialSlowDown.unhandled(feedback(), candidate(2_100))).toEqual([]);
  });
});
