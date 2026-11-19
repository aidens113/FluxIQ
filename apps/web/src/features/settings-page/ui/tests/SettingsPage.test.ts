import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../SettingsPage.tsx", import.meta.url), "utf8");

describe("the Settings page", () => {
  it("has no Connect a client section of its own: one line points to Security, Devices and apps", () => {
    expect(source).not.toContain("ConnectClientSection");
    expect(source).toContain('href="/security/devices"');
  });

  it("puts the AI keys section, with the card, before the assistant's model", () => {
    expect(source.indexOf("<AiKeysSection")).toBeGreaterThan(-1);
    expect(source.indexOf("<AiKeysSection")).toBeLessThan(source.indexOf("<AssistantModelSection"));
  });

  it("gives the assistant's model section the anchor the card's Change model goes to", () => {
    expect(readFileSync(new URL("../AssistantModelSection.tsx", import.meta.url), "utf8")).toContain('id="assistant-model"');
  });

  it("keeps room for the sections that wait for the keys, so the page does not shift when they arrive (sweep #3)", () => {
    expect(source).toContain('className="settings-reserve"');
    expect(readFileSync(new URL("../settings-page.css", import.meta.url), "utf8")).toMatch(/\.settings-reserve \{ min-height:/);
  });
});
