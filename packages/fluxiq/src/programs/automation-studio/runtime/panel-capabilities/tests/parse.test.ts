// Reading a vocabulary off a request. A bad entry is dropped; a bad list is not
// a reason to leave the person with a chat window that can do nothing.

import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_PANEL_CAPABILITY_MAX, parseAutomationStudioPanelCapabilities } from "../index.ts";

describe("reading the panel's capability vocabulary", () => {
  it("keeps what it can understand and drops only the entries it cannot", () => {
    const parsed = parseAutomationStudioPanelCapabilities([
      { id: "flow.build", title: "Build it", summary: "build a Flow", group: "Flows", control: "Build", arguments: [], reauthorizes: false },
      { title: "no id at all" },
      "not an object",
      null,
      { id: "run.start" }
    ]);
    expect(parsed.map((capability) => capability.id)).toEqual(["flow.build", "run.start"]);
  });

  // Only the id cannot be invented: it is what the model answers with and what
  // the panel looks up. Everything else is filled rather than refused.
  it("fills a missing title, summary and group from the id", () => {
    const [capability] = parseAutomationStudioPanelCapabilities([{ id: "run.start" }]);
    expect(capability).toEqual({ id: "run.start", title: "run.start", summary: "run.start", group: "Other", control: "", arguments: [], phrases: [], consequences: [], reauthorizes: false });
  });

  it("drops a duplicate id, because the model picks by id and two would be ambiguous when acted on", () => {
    const parsed = parseAutomationStudioPanelCapabilities([{ id: "run.start", title: "First" }, { id: "run.start", title: "Second" }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe("First");
  });

  it("reads arguments, defaulting an unmarked one to optional", () => {
    const [capability] = parseAutomationStudioPanelCapabilities([
      { id: "run.start", arguments: [{ name: "flowId" }, { name: "text", describe: "what to say", required: true }, { describe: "nameless" }] }
    ]);
    expect(capability?.arguments).toEqual([
      { name: "flowId", describe: "flowId", required: false },
      { name: "text", describe: "what to say", required: true }
    ]);
  });

  it("answers nothing for anything that is not a list, and bounds a list that is far too long", () => {
    expect(parseAutomationStudioPanelCapabilities(null)).toEqual([]);
    expect(parseAutomationStudioPanelCapabilities({ id: "run.start" })).toEqual([]);
    const many = Array.from({ length: AUTOMATION_STUDIO_PANEL_CAPABILITY_MAX + 40 }, (_unused, index) => ({ id: `capability.${index}` }));
    expect(parseAutomationStudioPanelCapabilities(many)).toHaveLength(AUTOMATION_STUDIO_PANEL_CAPABILITY_MAX);
  });

  it("refuses an id that is not one, rather than carrying a name nothing can look up", () => {
    expect(parseAutomationStudioPanelCapabilities([{ id: "run start" }, { id: "" }, { id: 7 }])).toEqual([]);
  });

  // Which classes stop for a person is Core's decision, so a capability that
  // deletes re-authorizes whatever the browser sent. A browser that marks one
  // as re-authorizing is still honoured: an extra prompt is an annoyance, a
  // skipped one is not safe.
  it("derives re-authorization from Core's own gated consequences, and carries phrases and consequences", () => {
    const parsed = parseAutomationStudioPanelCapabilities([
      { id: "flow.delete", consequences: ["delete"], reauthorizes: false, phrases: ["remove the flow", "", 7] },
      { id: "flow.settings", consequences: ["modify_existing"] },
      { id: "run.execute", consequences: ["create_new"], reauthorizes: true }
    ]);
    expect(parsed.map((capability) => [capability.id, capability.reauthorizes])).toEqual([["flow.delete", true], ["flow.settings", false], ["run.execute", true]]);
    expect(parsed[0]?.phrases).toEqual(["remove the flow"]);
    expect(parsed[0]?.consequences).toEqual(["delete"]);
  });
});
