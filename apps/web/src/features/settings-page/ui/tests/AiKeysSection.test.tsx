import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SettingsData } from "../../data";
import type { SettingsKey, SettingsModelChoices } from "../../model";
import { AiKeysSection } from "../AiKeysSection";

const refused = async () => "That did not work. Try again.";

/** What the section reads; the actions refuse, since a render never calls them. */
function data(keys: SettingsKey[], choices: SettingsModelChoices): SettingsData {
  return { loading: false, loadError: "", keys, choices, allowance: null, setDefault: refused, saveAssistant: refused, saveAllowance: refused, addKey: refused, remove: async () => ({ kind: "failed", error: "" }) } as unknown as SettingsData;
}
const render = (keys: SettingsKey[], choices: SettingsModelChoices) => renderToStaticMarkup(createElement(AiKeysSection, { data: data(keys, choices), selectedId: "", onSelect: () => undefined }));

const MINE: SettingsKey[] = [
  { id: "mine-1", name: "My key", kind: "llm", provider: "Anthropic", enabled: true },
  { id: "mine-2", name: "My spare", kind: "llm", provider: "DeepSeek", enabled: true }
];
const choices = (over: Partial<SettingsModelChoices>): SettingsModelChoices => ({ defaultKeyId: "mine-1", assistantKeyId: null, assistantModel: null, assistantAllowanceUsd: null, ...over });

describe("AiKeysSection", () => {
  it("offers the person who chooses for the workspace a control to make each key the default", () => {
    const html = render(MINE, choices({ mayChoose: true }));
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("Make My spare the default key");
    expect(html).toContain("pick another below any time");
  });

  it("offers it when the panel says nothing about the person, and the server decides", () => {
    expect(render(MINE, choices({})).match(/type="radio"/g)).toHaveLength(2);
  });

  it("offers a member no control to make a key the default, even their own, and still lets them remove their keys", () => {
    const html = render(MINE, choices({ mayChoose: false }));
    expect(html).not.toContain("type=\"radio\"");
    expect(html).not.toContain("the default key\"");
    expect(html).toContain("chooses its default key");
    expect(html).toContain("Remove My key");
    expect(html).toContain("Remove My spare");
    // Their own key is the workspace's default: said, not offered.
    expect(html.match(/>Default</g)).toHaveLength(1);
  });

  it("never marks a member's own key as the default when the workspace's default is someone else's", () => {
    const html = render(MINE, choices({ mayChoose: false, defaultKeyId: "owners-key" }));
    expect(html).not.toContain(">Default<");
    expect(html).not.toContain("data-default=\"true\"");
  });

  it("offers each of the person's own keys to the workspace, and never another person's", () => {
    const keys: SettingsKey[] = [
      { ...MINE[0]!, heldByYou: true, offeredToWorkspace: true },
      { ...MINE[1]!, heldByYou: true },
      { id: "theirs", name: "Their key", kind: "llm", provider: "Anthropic", enabled: true, offeredToWorkspace: true },
      { id: "quiet", name: "Quiet key", kind: "llm", provider: "Anthropic", enabled: true }
    ];
    const html = render(keys, choices({ mayChoose: true }));
    expect(html).toContain("aria-label=\"Offer My key to the workspace\"");
    expect(html).toContain("aria-label=\"Offer My spare to the workspace\"");
    expect(html).not.toContain("Offer Their key to the workspace");
    expect(html).not.toContain("Offer Quiet key to the workspace");
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    // Another person's offered key is said, not offered again.
    expect(html.match(/>Offered to the workspace</g)).toHaveLength(1);
  });

  it("lets a person who chooses for the workspace choose the key in use when nobody chose it yet", () => {
    const html = render(MINE, choices({ mayChoose: true, assistantKeyChosen: false, assistantKeyOffered: false }));
    expect(html).toContain("No key is chosen to pay for other people’s messages yet.");
    expect(html).toContain("Choose My key as the workspace’s key");
  });

  it("tells a chooser when the workspace's key was not offered by its holder, and when it pays for everyone", () => {
    expect(render(MINE, choices({ mayChoose: true, assistantKeyChosen: true, assistantKeyOffered: false }))).toContain("My key is the workspace’s key, but the person who added it has not offered it to the workspace");
    const shared = render(MINE, choices({ mayChoose: true, assistantKeyChosen: true, assistantKeyOffered: true }));
    expect(shared).toContain("My key is the workspace’s key and pays for everyone’s messages.");
    expect(shared).not.toContain("Choose My key");
  });

  it("shows a member no choice of the workspace's key", () => {
    const html = render(MINE, choices({ mayChoose: false, assistantKeyChosen: false }));
    expect(html).not.toContain("No key is chosen to pay");
    expect(html).not.toContain("Choose My key as the workspace’s key");
    expect(html).not.toContain("settings-workspace-key");
  });
});
