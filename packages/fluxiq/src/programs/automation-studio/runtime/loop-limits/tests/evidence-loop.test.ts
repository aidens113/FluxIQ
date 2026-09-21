import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_ACTIONS_PER_DECISION,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS
} from "../evidence-loop.ts";

describe("Automation Studio evidence-loop action decision limits", () => {
  it("keeps ordered decisions disabled under a separately bounded opt-in", () => {
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_ACTIONS_PER_DECISION).toBe(1);
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxActionsPerDecision).toBe(16);
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_ACTIONS_PER_DECISION)
      .toBeLessThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxActionsPerDecision);
  });
});
