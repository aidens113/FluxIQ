import { PANEL_EMAIL_TEMPLATES } from "@fluxiq/contracts/platform";
import { describe, expect, it } from "vitest";
import { MemoryEmailSender } from "../memory-email-sender.ts";
import { NoneEmailSender } from "../none-email-sender.ts";
import { renderPlatformEmail } from "../render-platform-email.ts";
import { STOCK_PLATFORM_EMAIL_TEMPLATES } from "../stock-email-templates.ts";

describe("renderPlatformEmail", () => {
  it("has stock text for every panel template", () => {
    expect(Object.keys(STOCK_PLATFORM_EMAIL_TEMPLATES).sort()).toEqual([...PANEL_EMAIL_TEMPLATES].sort());
  });

  it("fills known placeholders and empties unknown ones, never leaving a raw placeholder", () => {
    const rendered = renderPlatformEmail({ template: "password-reset", to: "a@example.test", variables: { displayName: "Ada", resetUrl: "https://x.test/reset#token=t" } });
    expect(rendered.subject).toBe("Reset your FluxIQ password");
    expect(rendered.text).toContain("Hello Ada,");
    expect(rendered.text).toContain("https://x.test/reset#token=t");
    expect(rendered.text).toContain("expires in  minutes");
    expect(rendered.text).not.toContain("{{");
  });

  it("does not read inherited names as variables", () => {
    const rendered = renderPlatformEmail({ template: "welcome", to: "a@example.test", variables: {} }, { welcome: { subject: "{{constructor}}", text: "{{toString}}" } });
    expect(rendered).toMatchObject({ subject: "", text: "" });
  });
});

describe("memory and none senders", () => {
  it("keeps messages in order, fails on request, and discards with none", async () => {
    const memory = new MemoryEmailSender();
    await memory.send({ template: "welcome", to: "a@example.test", variables: { welcomeUrl: "u" } });
    memory.failNext();
    await expect(memory.send({ template: "welcome", to: "b@example.test", variables: {} })).rejects.toThrow();
    expect(memory.messages.map((message) => message.to)).toEqual(["a@example.test"]);
    await expect(new NoneEmailSender().send({ template: "welcome", to: "a@example.test", variables: {} })).resolves.toBeUndefined();
  });
});
