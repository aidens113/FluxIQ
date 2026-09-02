import { describe, expect, it } from "vitest";
import { normalizeAutomationStudioRuntimeInterventionMode } from "./service.ts";

describe("runtime intervention mode request compatibility", () => {
  it.each([
    [undefined, "fully_adaptive"],
    ["default", "fully_adaptive"],
    ["deterministic", "no_llm_intervention"],
    ["fully_adaptive", "fully_adaptive"],
    ["manual_approval", "manual_approval"],
    ["no_llm_intervention", "no_llm_intervention"]
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeAutomationStudioRuntimeInterventionMode(input)).toBe(expected);
  });
});
