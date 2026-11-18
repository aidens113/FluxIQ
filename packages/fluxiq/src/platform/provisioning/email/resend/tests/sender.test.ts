import { describe, expect, it, vi } from "vitest";
import { ResendEmailSender } from "../sender.ts";
import type { PlatformEmailMessage } from "../../../types.ts";

const message: PlatformEmailMessage = {
  template: "welcome", to: "customer@example.test",
  variables: { displayName: "Ada", welcomeUrl: "https://app.example.test/welcome#private-token", expiresInHours: "24" }
};

describe("ResendEmailSender", () => {
  it("delivers rendered plain text to the fixed HTTPS provider without following redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "mail-id" }));
    const sender = new ResendEmailSender({ apiKey: "secret-key", from: "FluxIQ <hello@example.test>", fetch: fetcher });
    await sender.send(message);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { authorization: "Bearer secret-key" } });
    expect(JSON.parse(init!.body as string)).toMatchObject({ from: "FluxIQ <hello@example.test>", to: [message.to], subject: "Finish setting up your FluxIQ account" });
    expect(JSON.parse(init!.body as string).text).toContain(message.variables.welcomeUrl);
    expect(sender.kind).toBe("resend");
  });

  it("uses template overrides and stable opaque delivery identities, without deduplicating unrelated identical emails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: "mail-id" }));
    const sender = new ResendEmailSender({ apiKey: "key", from: "hello@example.test", fetch: fetcher, templates: { welcome: { subject: "Hello {{displayName}}", text: "Visit {{welcomeUrl}}" } } });
    await sender.send({ ...message, deliveryId: "delivery-one" });
    await sender.send({ ...message, deliveryId: "delivery-one" });
    await sender.send({ ...message, deliveryId: "delivery-two" });
    await sender.send(message);
    const headers = fetcher.mock.calls.map((call) => call[1]!.headers as Record<string, string>);
    expect(headers[0]!["idempotency-key"]).toBe(headers[1]!["idempotency-key"]);
    expect(headers[0]!["idempotency-key"]).not.toBe(headers[2]!["idempotency-key"]);
    expect(headers[0]!["idempotency-key"]).not.toContain("delivery-one");
    expect(headers[3]!["idempotency-key"]).toBeUndefined();
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).subject).toBe("Hello Ada");
  });

  it.each([401, 429, 500, 302])("reports HTTP %s without leaking provider bodies or retrying blindly", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("secret-key private-token customer@example.test", { status }));
    const sender = new ResendEmailSender({ apiKey: "secret-key", from: "hello@example.test", fetch: fetcher });
    const error = await sender.send(message).catch((caught: Error) => caught);
    expect(error).toMatchObject({ code: "platform.email.rejected", status });
    expect(String(error)).not.toMatch(/secret-key|private-token|customer@example/u);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("redacts transport failures including nested causes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private-token", { cause: "secret-key" }));
    const sender = new ResendEmailSender({ apiKey: "secret-key", from: "hello@example.test", fetch: fetcher });
    const error = await sender.send(message).catch((caught: Error) => caught);
    expect(error).toMatchObject({ code: "platform.email.transport" });
    expect((error as Error).cause).toBeUndefined();
    expect(String(error)).not.toContain("private-token");
  });

  it.each(["not json", "{}", '{"id":null}', '{"id":""}'])("requires a confirmed delivery response: %s", async (body) => {
    const sender = new ResendEmailSender({ apiKey: "key", from: "hello@example.test", fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(body)) });
    await expect(sender.send(message)).rejects.toMatchObject({ code: "platform.email.response" });
  });

  it("rejects missing or multiline configuration and an empty explicit delivery identity", async () => {
    expect(() => new ResendEmailSender({ apiKey: " ", from: "mail" })).toThrow("API key");
    expect(() => new ResendEmailSender({ apiKey: "key\r\nsecret", from: "mail" })).toThrow("API key");
    expect(() => new ResendEmailSender({ apiKey: "key", from: "\nmail" })).toThrow("sender address");
    const fetcher = vi.fn<typeof fetch>();
    const sender = new ResendEmailSender({ apiKey: "key", from: "mail", fetch: fetcher });
    await expect(sender.send({ ...message, deliveryId: " " })).rejects.toThrow("identity");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
