import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SettingsData } from "../../data";
import type { SettingsKey, SettingsModelChoices } from "../../model";
import { AssistantModelSection } from "../AssistantModelSection";

const refused = async () => "That did not work. Try again.";

/** What the section reads; the actions refuse, since a render never calls them. */
function data(keys: SettingsKey[], choices: SettingsModelChoices): SettingsData {
  return { loading: false, loadError: "", keys, choices, allowance: null, setDefault: refused, saveAssistant: refused, saveAllowance: refused, addKey: refused, remove: async () => ({ kind: "failed", error: "" }) } as unknown as SettingsData;
}

const TEAM: SettingsModelChoices = { defaultKeyId: "team", assistantKeyId: "team", assistantModel: "claude-haiku-5-5", assistantProvider: "Anthropic", assistantAllowanceUsd: null };

describe("AssistantModelSection", () => {
  it("shows a member the workspace's provider and model, with no control to change the key or model", () => {
    const html = renderToStaticMarkup(createElement(AssistantModelSection, { data: data([], TEAM) }));
    expect(html).toContain("this workspace’s Anthropic key");
    expect(html).toContain("claude-haiku-5-5");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Add an AI key above");
  });

  it("says the provider's usual model when none was chosen", () => {
    const html = renderToStaticMarkup(createElement(AssistantModelSection, { data: data([], { ...TEAM, assistantModel: null }) }));
    expect(html).toContain("the provider’s usual model");
    expect(html).not.toContain("<select");
  });

  it("offers the key and model to a person whose own key the assistant uses", () => {
    const own: SettingsKey = { id: "team", name: "Team key", kind: "llm", provider: "Anthropic", enabled: true };
    const html = renderToStaticMarkup(createElement(AssistantModelSection, { data: data([own], TEAM) }));
    expect(html.match(/<select/g)).toHaveLength(2);
    expect(html).not.toContain("this workspace’s");
  });
});
