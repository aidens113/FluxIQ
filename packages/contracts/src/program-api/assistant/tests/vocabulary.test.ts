// The assistant's closed vocabularies: consequence classes and panel context keys.
import { describe, expect, it } from "vitest";
import { ASSISTANT_CONSEQUENCES, isAssistantConsequence, isPanelContextKey, PANEL_CONTEXT_KEYS } from "../index.ts";

describe("assistant vocabulary", () => {
  it("names the six consequence classes and recognises only them", () => {
    expect(ASSISTANT_CONSEQUENCES).toEqual(["read", "change", "send", "money", "delete", "security"]);
    for (const value of ASSISTANT_CONSEQUENCES) expect(isAssistantConsequence(value)).toBe(true);
    for (const value of ["per-call", "write", "", 3, undefined]) expect(isAssistantConsequence(value)).toBe(false);
  });

  it("names the panel context keys and recognises only them", () => {
    expect(PANEL_CONTEXT_KEYS).toContain("flowId");
    for (const value of PANEL_CONTEXT_KEYS) expect(isPanelContextKey(value)).toBe(true);
    for (const value of ["selection", "flow", null]) expect(isPanelContextKey(value)).toBe(false);
  });
});
