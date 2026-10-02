// A domain's system instructions are checked when the runtime is bound, so a
// text Core would refuse stops the host there and never fails a build halfway.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../harness-options/index.ts";
import {
  AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH,
  assertAutomationStudioLlmDomainSystemInstructions,
  automationStudioLlmEvidenceRuntimeBindingChecked
} from "../index.ts";

describe("assertAutomationStudioLlmDomainSystemInstructions", () => {
  it("accepts a versioned text, line feeds included, and returns exactly its two fields", () => {
    const checked = assertAutomationStudioLlmDomainSystemInstructions({ version: "web.v2-1_a", text: "Line one.\nLine two.", extra: "dropped" }, "web");

    expect(checked).toEqual({ version: "web.v2-1_a", text: "Line one.\nLine two." });
  });

  it("accepts a text of exactly the limit, and the limit is 4,000", () => {
    expect(AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH).toBe(4_000);
    expect(() => assertAutomationStudioLlmDomainSystemInstructions({ version: "v1", text: "x".repeat(4_000) }, "web")).not.toThrow();
  });

  it.each([
    ["an upper-case version", { version: "Web.v1", text: "Rules." }, /version must match/u],
    ["a version starting with a dot", { version: ".v1", text: "Rules." }, /version must match/u],
    ["a version with a space", { version: "web v1", text: "Rules." }, /version must match/u],
    ["a version of 65 characters", { version: `v${"1".repeat(64)}`, text: "Rules." }, /version must match/u],
    ["an empty version", { version: "", text: "Rules." }, /version must match/u],
    ["a missing version", { text: "Rules." }, /version must match/u],
    ["an empty text", { version: "v1", text: "" }, /text must not be empty/u],
    ["a whitespace text", { version: "v1", text: " \n  \n" }, /text must not be empty/u],
    ["a text over the limit", { version: "v1", text: "x".repeat(4_001) }, /4001 characters, over the 4000-character limit/u],
    ["a tab", { version: "v1", text: "Rules.\tMore." }, /control character/u],
    ["a carriage return", { version: "v1", text: "Rules.\r\nMore." }, /control character/u],
    ["an escape", { version: "v1", text: "Rules.\u001b[2J" }, /control character/u],
    ["a C1 control", { version: "v1", text: "Rules.\u0085" }, /control character/u],
    ["a non-object", "Rules.", /must be an object/u]
  ])("refuses %s, naming the domain", (_name, value, message) => {
    expect(() => assertAutomationStudioLlmDomainSystemInstructions(value, "web")).toThrow(message);
    expect(() => assertAutomationStudioLlmDomainSystemInstructions(value, "web")).toThrow(/domain "web" system instructions/u);
  });
});

describe("automationStudioLlmEvidenceRuntimeBindingChecked", () => {
  const binding = (systemInstructions?: unknown): AutomationStudioLlmEvidenceRuntimeBinding => ({
    domainId: "web",
    deniedEvidenceKeys: [],
    tools: [],
    executeTool: async () => ({}),
    ...(systemInstructions === undefined ? {} : { systemInstructions: systemInstructions as never })
  });

  it("returns a binding without instructions as it is", () => {
    const plain = binding();

    expect(automationStudioLlmEvidenceRuntimeBindingChecked(plain)).toBe(plain);
    expect(automationStudioLlmEvidenceRuntimeBindingChecked(undefined)).toBeUndefined();
  });

  it("keeps the checked instructions and the rest of the binding", () => {
    const checked = automationStudioLlmEvidenceRuntimeBindingChecked(binding({ version: "v1", text: "Rules.", extra: 1 }));

    expect(checked.systemInstructions).toEqual({ version: "v1", text: "Rules." });
    expect(checked.domainId).toBe("web");
  });

  it("throws for instructions Core would refuse", () => {
    expect(() => automationStudioLlmEvidenceRuntimeBindingChecked(binding({ version: "v1", text: "" }))).toThrow(/domain "web" system instructions v1: text must not be empty/u);
  });
});
