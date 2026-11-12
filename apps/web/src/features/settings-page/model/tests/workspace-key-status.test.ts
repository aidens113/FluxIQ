import { describe, expect, it } from "vitest";
import type { SettingsKey, SettingsModelChoices } from "../types";
import { workspaceKeyStatus } from "../workspace-key-status";

const own: SettingsKey = { id: "mine", name: "Mine", kind: "llm", provider: "Anthropic", enabled: true, heldByYou: true };
const theirs: SettingsKey = { id: "team", name: "Team", kind: "llm", provider: "Anthropic", enabled: true };
const choices = (over: Partial<SettingsModelChoices>): SettingsModelChoices => ({ defaultKeyId: "team", assistantKeyId: null, assistantModel: null, assistantAllowanceUsd: null, ...over });

describe("workspaceKeyStatus", () => {
  it("is none with no model key at all", () => {
    expect(workspaceKeyStatus([], choices({ defaultKeyId: null }))).toBe("none");
  });

  it("is yours when the key in use is the person's own, chosen or offered or not", () => {
    expect(workspaceKeyStatus([own], choices({ defaultKeyId: "mine" }))).toBe("yours");
    expect(workspaceKeyStatus([own], choices({ defaultKeyId: null }))).toBe("yours");
  });

  it("pays for another person's messages only when chosen and offered", () => {
    expect(workspaceKeyStatus([theirs], choices({}))).toBe("not-chosen");
    expect(workspaceKeyStatus([], choices({ assistantKeyOffered: true }))).toBe("not-chosen");
    expect(workspaceKeyStatus([], choices({ assistantKeyChosen: true }))).toBe("not-offered");
    expect(workspaceKeyStatus([theirs], choices({ assistantKeyChosen: true, assistantKeyOffered: true }))).toBe("shared");
  });
});
