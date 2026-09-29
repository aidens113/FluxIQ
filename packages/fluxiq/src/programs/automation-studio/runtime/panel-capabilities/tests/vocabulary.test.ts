// What a model is actually shown, and what it must never be shown.
//
// These cases are about wording as much as structure, because the wording is
// the mechanism: a model told it needs permission will ask for permission, and
// a model shown a capability the panel does not have will offer something that
// cannot happen.

import { describe, expect, it } from "vitest";

import { automationStudioPanelCapabilityIds, automationStudioPanelCapabilityVocabulary } from "../index.ts";
import type { AutomationStudioPanelCapability } from "../index.ts";

function capability(overrides: Partial<AutomationStudioPanelCapability> = {}): AutomationStudioPanelCapability {
  return {
    id: "run.execute",
    title: "Run it",
    summary: "run this Flow and wait for the answer",
    group: "Running",
    control: "Run (runtime-debug)",
    arguments: [{ name: "flowId", describe: "which Flow", required: false }],
    phrases: [],
    consequences: [],
    reauthorizes: false,
    ...overrides
  };
}

describe("the panel capability vocabulary a model is given", () => {
  it("names every capability by the exact id the model has to answer with", () => {
    const capabilities = [capability(), capability({ id: "flow.build", group: "Flows" })];
    const text = automationStudioPanelCapabilityVocabulary(capabilities);
    expect(text).toContain("run.execute");
    expect(text).toContain("flow.build");
    expect(automationStudioPanelCapabilityIds(capabilities)).toEqual(["run.execute", "flow.build"]);
  });

  it("groups under the panel's own headings, each group keeping the order it arrived in", () => {
    const text = automationStudioPanelCapabilityVocabulary([
      capability({ id: "run.start" }),
      capability({ id: "flow.build", group: "Flows" }),
      capability({ id: "run.cancel" })
    ]);
    expect(text.indexOf("Running:")).toBeLessThan(text.indexOf("Flows:"));
    expect(text.indexOf("run.start")).toBeLessThan(text.indexOf("run.cancel"));
    expect(text.match(/Running:/gu)).toHaveLength(1);
  });

  // The standing rule: the person asking for the automation is the grant. A
  // model that asks whether it may edit a setting is the defect this default was
  // corrected to remove, so the instructions must never invite it to.
  it("tells the model not to ask whether it may proceed", () => {
    const text = automationStudioPanelCapabilityVocabulary([capability()]);
    expect(text).toContain("already authorised");
    expect(text).toContain("Do not ask whether you may proceed");
    expect(text).toContain("None of these re-authorize");
  });

  // Re-authorizing is the person proving who they are again. Calling it
  // permission is what teaches a model to ask, so the word is chosen.
  it("calls the deleting and money-moving ones re-authorizing, not permission-seeking", () => {
    const text = automationStudioPanelCapabilityVocabulary([
      capability(),
      capability({ id: "flow.delete", group: "Flows", reauthorizes: true })
    ]);
    expect(text).toContain("These re-authorize before they run");
    expect(text).toContain("flow.delete");
    expect(text).not.toContain("run.execute, flow.delete");
    expect(text).toContain("not you asking whether you may");
  });

  it("marks only the arguments that are genuinely required, so the rest can be filled from the screen", () => {
    const text = automationStudioPanelCapabilityVocabulary([
      capability({ arguments: [{ name: "flowId", describe: "which Flow", required: false }, { name: "text", describe: "what to say", required: true }] })
    ]);
    expect(text).toContain("arguments: flowId, text (required)");
    // The shape of a value that is not an id is shown; an id's is not.
    expect(text).toContain("text: what to say");
    expect(text).not.toContain("flowId: which Flow");
    expect(text).toContain("filled in from what the panel has open");
  });

  // An empty list read as "anything goes" is the worst possible failure here:
  // the model would invent capability ids and every one would miss.
  it("says plainly that there is nothing to operate rather than offering an empty list", () => {
    const text = automationStudioPanelCapabilityVocabulary([]);
    expect(text).toContain("no capabilities");
    expect(text).not.toContain("Choose one capability");
    expect(automationStudioPanelCapabilityIds([])).toEqual([]);
  });
});
