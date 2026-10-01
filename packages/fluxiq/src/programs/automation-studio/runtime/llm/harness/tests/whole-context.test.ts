// What a request carries about the Flow and the run around a failure, whole.
//
// The user's order of 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
// ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION." Until then a request
// carried the run's last 12 actions, 25 relevant runs, 25 relevant
// adaptations, 100 Subflows and 100 available actions, and the conversation's
// last 20 turns that fit 4,000 bytes, each cut at 1,500 characters.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioConversationTurn } from "../../../conversations/index.ts";
import { packAutomationStudioLlmContext, type AutomationStudioLlmHarnessInput } from "../index.ts";
import { packAutomationStudioLlmConversation } from "../conversation.ts";

const ACTIONS = 40;
const MANY = 150;

function attempt(index: number) {
  return { attemptId: `attempt.${index}`, nodeId: `node.${index}`, definitionId: "builtin.policy.action", order: index, status: index === ACTIONS ? "failed" : "succeeded", startedAt: index } as never;
}

function subflow(index: number) {
  return { schemaVersion: "0.1", subflowId: `subflow.${index}`, flowId: "flow.whole", projectId: "project.whole", name: `Subflow ${index}`, role: "primary", status: "active", createdAt: 1, updatedAt: 1 } as never;
}

function turn(index: number): AutomationStudioConversationTurn {
  return { turnId: `turn.${index}`, ordinal: index, author: index % 2 ? "person" : "automation", text: `Turn ${index} ${"only the Plus ones ".repeat(200)}`.trim() } as AutomationStudioConversationTurn;
}

function input(): AutomationStudioLlmHarnessInput {
  return {
    taskKind: "runtime_diagnosis",
    projectId: "project.whole",
    flowId: "flow.whole",
    runId: "run.whole",
    instructions: [],
    deniedEvidenceKeys: [],
    runDetail: {
      schemaVersion: "0.1",
      summary: { schemaVersion: "0.1", runId: "run.whole", flowId: "flow.whole", projectId: "project.whole", status: "failed", updatedAt: 1, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: ACTIONS, interventionCount: 0, adaptationCount: 0 },
      actionAttempts: Array.from({ length: ACTIONS }, (_unused, index) => attempt(index + 1)),
      routeDecisions: [],
      subflows: [],
      recoveryAttempts: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    } as never,
    relevantRuns: Array.from({ length: MANY }, (_unused, index): JsonObject => ({ runId: `run.${index}` })),
    relevantAdaptations: Array.from({ length: MANY }, (_unused, index): JsonObject => ({ adaptationId: `adaptation.${index}` })),
    subflows: Array.from({ length: MANY }, (_unused, index) => subflow(index)),
    availableActions: Array.from({ length: MANY }, (_unused, index): JsonObject => ({ actionId: `action.${index}` })),
    conversation: Array.from({ length: 60 }, (_unused, index) => turn(index + 1))
  };
}

describe("a request's context about the Flow and the run", () => {
  it("carries every action the run took, in order, not the last twelve", () => {
    const context = packAutomationStudioLlmContext(input());
    expect(context.recentActions?.map((action) => action.attemptId)).toEqual(Array.from({ length: ACTIONS }, (_unused, index) => `attempt.${index + 1}`));
  });

  it("carries every relevant run, adaptation, Subflow and available action, not the first 25 or 100", () => {
    const context = packAutomationStudioLlmContext(input());
    expect(context.relevantRuns).toHaveLength(MANY);
    expect(context.relevantAdaptations).toHaveLength(MANY);
    expect(context.subflows?.map((item) => item.subflowId)).toEqual(Array.from({ length: MANY }, (_unused, index) => `subflow.${index}`));
    expect(context.availableActions).toHaveLength(MANY);
  });

  it("carries every turn of the conversation, each whole, in reading order", () => {
    const context = packAutomationStudioLlmContext(input());
    const turns = input().conversation!;
    expect(context.conversation?.turns.map((item) => item.ordinal)).toEqual(turns.map((item) => item.ordinal));
    expect(context.conversation?.turns.map((item) => item.text)).toEqual(turns.map((item) => item.text));
    expect(context.conversation).toMatchObject({ withheldTurns: 0, textCut: false });
  });
});

describe("the conversation packer", () => {
  it("leaves out only an empty turn", () => {
    const packed = packAutomationStudioLlmConversation([turn(1), { ...turn(2), text: "   " }, turn(3)]);
    expect(packed?.turns.map((item) => item.ordinal)).toEqual([1, 3]);
    expect(packAutomationStudioLlmConversation([{ ...turn(1), text: "" }])).toBeUndefined();
  });
});
