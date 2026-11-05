// A saved Flow's run may take as many engine steps as its nodes and their retries need, and never
// fewer than any other run gets.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBuildPlan } from "../../../../../../runtime/flow-authoring/bootstrap/plan/index.ts";
import { automationStudioAnswerFirstFlowRunStepBound } from "../step-bound.ts";

const planOf = (...sizes: number[]) => ({ plan: { subflows: sizes.map((size) => ({ nodes: Array.from({ length: size }, () => ({})) })) } }) as unknown as AutomationStudioFlowBuildPlan;

describe("a saved Flow's step bound", () => {
  it("is the engine's default for a short Flow", () => expect(automationStudioAnswerFirstFlowRunStepBound(planOf(5))).toBe(250));
  it("follows a long Flow across its parts, at a first try and three retries a node", () => expect(automationStudioAnswerFirstFlowRunStepBound(planOf(200, 100))).toBe(1_200));
});
