import { afterEach, describe, expect, it } from "vitest";
import type { PlatformEmailMessage } from "../../../types.ts";
import { parseSmtpEndpoint } from "../parse-smtp-endpoint.ts";
import { SmtpEmailSender } from "../sender.ts";
import { selfSignedCertificate } from "./self-signed-certificate.ts";
import { startSmtpTestServer, type SmtpTestServer, type SmtpTestServerOptions } from "./smtp-test-server.ts";

const message: PlatformEmailMessage = {
  template: "welcome", to: "customer@example.test",
  variables: { displayName: "Ada", welcomeUrl: "https://app.example.test/welcome#token=private-token", expiresInHours: "24" }
};
const certificate = selfSignedCertificate();
const servers: SmtpTestServer[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await server.close(); });

async function server(options: SmtpTestServerOptions = {}): Promise<SmtpTestServer> {
  const started = await startSmtpTestServer(options);
  servers.push(started);
  return started;
}

function body(data: string): string {
  const [, encoded = ""] = data.split("\r\n\r\n");
  return Buffer.from(encoded.replace(/\r\n/gu, ""), "base64").toString("utf8");
}

describe("SmtpEmailSender", () => {
  it("delivers the rendered message to a plain sink, with headers and a base64 UTF-8 body", async () => {
    const sink = await server();
    const sender = new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtp://127.0.0.1:${sink.port}`), from: "FluxIQ <accounts@fluxiq.example>" });
    await sender.send(message);
    expect(sender.kind).toBe("smtp");
    expect(sink.received).toHaveLength(1);
    const [mail] = sink.received;
    expect(mail).toMatchObject({ mailFrom: "<accounts@fluxiq.example>", recipients: ["<customer@example.test>"], secure: false, authenticatedAs: null });
    expect(mail!.data).toContain("From: FluxIQ <accounts@fluxiq.example>\r\n");
    expect(mail!.data).toContain("To: customer@example.test\r\n");
    expect(mail!.data).toContain("Subject: Finish setting up your FluxIQ account\r\n");
    expect(body(mail!.data)).toContain(message.variables.welcomeUrl);
    expect(sink.commands[0]).toBe("EHLO fluxiq.example");
    expect(sink.commands.at(-1)).toBe("QUIT");
  });

  it("derives a stable Message-ID from a delivery identity without exposing it", async () => {
    const sink = await server();
    const sender = new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtp://127.0.0.1:${sink.port}`), from: "accounts@fluxiq.example" });
    await sender.send({ ...message, deliveryId: "delivery-one" });
    await sender.send({ ...message, deliveryId: "delivery-one" });
    await sender.send({ ...message, deliveryId: "delivery-two" });
    const ids = sink.received.map((mail) => /Message-ID: (.*)\r\n/u.exec(mail.data)?.[1]);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toBe(ids[2]);
    expect(ids[0]).not.toContain("delivery-one");
    await expect(sender.send({ ...message, deliveryId: " " })).rejects.toThrow("identity");
  });

  it("falls back to HELO when a plain server refuses EHLO", async () => {
    const sink = await server({ refuseEhlo: true });
    await new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtp://127.0.0.1:${sink.port}`), from: "accounts@fluxiq.example" }).send(message);
    expect(sink.commands.slice(0, 2)).toEqual(["EHLO fluxiq.example", "HELO fluxiq.example"]);
    expect(sink.received).toHaveLength(1);
  });

  it("reports a refused recipient by its reply code only", async () => {
    const sink = await server({ recipientReply: 550 });
    const sender = new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtp://127.0.0.1:${sink.port}`), from: "accounts@fluxiq.example" });
    const error = await sender.send(message).catch((caught: Error) => caught);
    expect(error).toMatchObject({ code: "platform.email.rejected", replyCode: 550 });
    expect(String(error)).not.toMatch(/customer@example|private-token/u);
    expect(sink.received).toHaveLength(0);
  });

  it("reports an unreachable server as a transport failure", async () => {
    const sink = await server();
    const port = sink.port;
    await sink.close();
    servers.splice(0);
    const error = await new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtp://127.0.0.1:${port}`), from: "accounts@fluxiq.example" }).send(message).catch((caught: Error) => caught);
    expect(error).toMatchObject({ code: "platform.email.transport" });
  });

  it("upgrades with STARTTLS before signing in with AUTH PLAIN", async () => {
    const relay = await server({ starttls: certificate, auth: { mechanisms: ["PLAIN", "LOGIN"], username: "mailer", secret: "relay-secret" } });
    const sender = new SmtpEmailSender({
      endpoint: parseSmtpEndpoint(`smtp+starttls://127.0.0.1:${relay.port}`), from: "accounts@fluxiq.example",
      auth: { username: "mailer", secret: "relay-secret" }, trustedCertificates: certificate.cert
    });
    await sender.send(message);
    expect(relay.received).toHaveLength(1);
    expect(relay.received[0]).toMatchObject({ secure: true, authenticatedAs: "mailer" });
    expect(relay.commands.indexOf("STARTTLS")).toBeLessThan(relay.commands.findIndex((line) => line.startsWith("AUTH")));
  });

  it("signs in with AUTH LOGIN over implicit TLS", async () => {
    const relay = await server({ implicitTls: certificate, auth: { mechanisms: ["LOGIN"], username: "mailer", secret: "relay-secret" } });
    const sender = new SmtpEmailSender({
      endpoint: parseSmtpEndpoint(`smtps://127.0.0.1:${relay.port}`), from: "accounts@fluxiq.example",
      auth: { username: "mailer", secret: "relay-secret" }, trustedCertificates: certificate.cert
    });
    await sender.send(message);
    expect(relay.received[0]).toMatchObject({ secure: true, authenticatedAs: "mailer" });
  });

  it("refuses a relay that does not offer STARTTLS, before any credential or mail is sent", async () => {
    const relay = await server({ auth: { mechanisms: ["PLAIN"], username: "mailer", secret: "relay-secret" } });
    const sender = new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtp+starttls://127.0.0.1:${relay.port}`), from: "accounts@fluxiq.example", auth: { username: "mailer", secret: "relay-secret" } });
    await expect(sender.send(message)).rejects.toMatchObject({ code: "platform.email.security" });
    expect(relay.commands.some((line) => line.startsWith("AUTH") || line.startsWith("MAIL"))).toBe(false);
  });

  it("refuses a certificate it does not trust", async () => {
    const relay = await server({ starttls: certificate });
    const sender = new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtp+starttls://127.0.0.1:${relay.port}`), from: "accounts@fluxiq.example" });
    await expect(sender.send(message)).rejects.toMatchObject({ code: "platform.email.security" });
    expect(relay.received).toHaveLength(0);
  });

  it("reports wrong credentials as a rejection", async () => {
    const relay = await server({ implicitTls: certificate, auth: { mechanisms: ["PLAIN"], username: "mailer", secret: "relay-secret" } });
    const sender = new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtps://127.0.0.1:${relay.port}`), from: "accounts@fluxiq.example", auth: { username: "mailer", secret: "wrong" }, trustedCertificates: certificate.cert });
    const error = await sender.send(message).catch((caught: Error) => caught);
    expect(error).toMatchObject({ code: "platform.email.rejected", replyCode: 535 });
    expect(String(error)).not.toContain("wrong");
  });

  it("refuses unsafe configuration", () => {
    const plain = parseSmtpEndpoint("smtp://mailpit:1025");
    expect(() => new SmtpEmailSender({ endpoint: plain, from: "accounts@fluxiq.example", auth: { username: "u", secret: "s" } })).toThrow("never sent unencrypted");
    expect(() => new SmtpEmailSender({ endpoint: plain, from: " " })).toThrow("sender address");
    expect(() => new SmtpEmailSender({ endpoint: plain, from: "a@b.example\r\nBcc: x@y.example" })).toThrow("sender address");
    const secure = parseSmtpEndpoint("smtps://relay.example:465");
    expect(() => new SmtpEmailSender({ endpoint: secure, from: "a@b.example", auth: { username: "u\r\n", secret: "s" } })).toThrow("credentials");
    expect(() => new SmtpEmailSender({ endpoint: plain, from: "a@b.example", clientName: "bad name" })).toThrow("host name");
  });

  it("refuses a recipient that could inject a command", async () => {
    const sink = await server();
    const sender = new SmtpEmailSender({ endpoint: parseSmtpEndpoint(`smtp://127.0.0.1:${sink.port}`), from: "accounts@fluxiq.example" });
    await expect(sender.send({ ...message, to: "a@b.example>\r\nRCPT TO:<c@d.example" })).rejects.toThrow("one line");
    expect(sink.commands).toHaveLength(0);
  });
});
