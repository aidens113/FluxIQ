import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveEmailSender } from "../resolve-email-sender";

const roots: string[] = [];
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fluxiq-email-sender-"));
  roots.push(dir);
  return dir;
}
const welcome = { template: "welcome", to: "a@example.test", variables: { displayName: "Ada", welcomeUrl: "https://app.example.test/welcome#token=t", expiresInHours: "24" } } as const;

describe("resolveEmailSender", () => {
  it("configures production delivery only when explicitly selected and complete", () => {
    expect(resolveEmailSender("resend", "/unused", "/", { FLUXIQ_EMAIL_API_KEY: "test-key", FLUXIQ_EMAIL_FROM: "mail@example.test" }).kind).toBe("resend");
    expect(() => resolveEmailSender("resend", "/unused", "/", {})).toThrow("API key");
    expect(() => resolveEmailSender("resend", "/unused", "/", { FLUXIQ_EMAIL_API_KEY: "test-key" })).toThrow("sender address");
    expect(resolveEmailSender(undefined, "/unused", "/", { FLUXIQ_EMAIL_API_KEY: "test-key", FLUXIQ_EMAIL_FROM: "mail@example.test" }).kind).toBe("file");
  });

  it("reads a mounted key relative to cwd and refuses ambiguous or unreadable sources", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "mail-key"), "test-key\n");
    const env = { FLUXIQ_EMAIL_API_KEY_FILE: "mail-key", FLUXIQ_EMAIL_FROM: "mail@example.test" };
    expect(resolveEmailSender("resend", "/unused", dir, env).kind).toBe("resend");
    expect(() => resolveEmailSender("resend", "/unused", dir, { ...env, FLUXIQ_EMAIL_API_KEY: "other-key" })).toThrow("only one");
    expect(() => resolveEmailSender("resend", "/unused", dir, { ...env, FLUXIQ_EMAIL_API_KEY_FILE: "missing" })).toThrow("could not be read");
  });
  it("answers the none sender for none", () => expect(resolveEmailSender("none", "/unused").kind).toBe("none"));

  it.each([undefined, "", "file"])("writes to the default directory for %j", async (value) => {
    const dir = tempDir();
    const sender = resolveEmailSender(value, path.join(dir, "outbox"));
    expect(sender.kind).toBe("file");
    await sender.send(welcome);
    expect(readdirSync(path.join(dir, "outbox"))).toHaveLength(1);
  });

  it("writes file:<dir> to an absolute directory", async () => {
    const dir = tempDir();
    const target = path.join(dir, "mail");
    await resolveEmailSender(`file:${target}`, path.join(dir, "outbox")).send(welcome);
    const [name] = readdirSync(target);
    expect(JSON.parse(readFileSync(path.join(target, name!), "utf8"))).toMatchObject({ template: "welcome", to: "a@example.test" });
    expect(() => readdirSync(path.join(dir, "outbox"))).toThrow();
  });

  it("resolves a relative file:<dir> from the working directory", async () => {
    const dir = tempDir();
    await resolveEmailSender("file:relative-mail", path.join(dir, "outbox"), dir).send(welcome);
    expect(readdirSync(path.join(dir, "relative-mail"))).toHaveLength(1);
  });

  it("delivers over SMTP to a mail sink named by smtp://host:port", async () => {
    const sink = await startMailSink();
    try {
      const sender = resolveEmailSender(`smtp://127.0.0.1:${sink.port}`, "/unused", "/", { FLUXIQ_EMAIL_FROM: "FluxIQ <accounts@example.test>" });
      expect(sender.kind).toBe("smtp");
      await sender.send(welcome);
      expect(sink.recipients).toEqual(["<a@example.test>"]);
    } finally { await sink.close(); }
  });

  it("configures an SMTP relay's sign-in and authority from files, and refuses an incomplete or unsafe one", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "smtp-secret"), "relay-secret\n");
    writeFileSync(path.join(dir, "relay-ca.pem"), "-----BEGIN CERTIFICATE-----\n");
    const env = { FLUXIQ_EMAIL_FROM: "mail@example.test", FLUXIQ_EMAIL_SMTP_USERNAME: "mailer", FLUXIQ_EMAIL_SMTP_PASSWORD_FILE: "smtp-secret" };
    expect(resolveEmailSender("smtp+starttls://smtp.example.test:587", "/unused", dir, env).kind).toBe("smtp");
    expect(resolveEmailSender("smtps://smtp.example.test", "/unused", dir, { ...env, FLUXIQ_EMAIL_SMTP_CA_FILE: "relay-ca.pem" }).kind).toBe("smtp");
    expect(() => resolveEmailSender("smtp://smtp.example.test:25", "/unused", dir, env)).toThrow("never sent unencrypted");
    expect(() => resolveEmailSender("smtps://smtp.example.test", "/unused", dir, { FLUXIQ_EMAIL_FROM: "mail@example.test", FLUXIQ_EMAIL_SMTP_USERNAME: "mailer" })).toThrow("needs both");
    expect(() => resolveEmailSender("smtps://smtp.example.test", "/unused", dir, { ...env, FLUXIQ_EMAIL_SMTP_PASSWORD_FILE: "missing" })).toThrow("could not be read");
    expect(() => resolveEmailSender("smtp://mailpit:1025", "/unused", dir, {})).toThrow("sender address");
    expect(() => resolveEmailSender("smtp://user:secret@mailpit:1025", "/unused", dir, { FLUXIQ_EMAIL_FROM: "mail@example.test" })).toThrow("credentials");
  });

  it("refuses an empty directory and unknown values", () => {
    expect(() => resolveEmailSender("file:", "/x")).toThrow(/file:<dir>/u);
    expect(() => resolveEmailSender("smtp", "/x")).toThrow(/none, file or file:<dir>, resend, or smtp:\/\/host:port/u);
  });
});

/** A one-connection SMTP sink that accepts everything and records the recipients. */
async function startMailSink(): Promise<{ port: number; recipients: string[]; close(): Promise<void> }> {
  const recipients: string[] = [];
  const server = createServer((socket) => {
    let buffer = "";
    let inData = false;
    socket.write("220 sink\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      for (let end = buffer.indexOf("\r\n"); end !== -1; end = buffer.indexOf("\r\n")) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 queued\r\n");
          }
          continue;
        }
        if (line.startsWith("RCPT TO:")) recipients.push(line.slice("RCPT TO:".length));
        if (line === "DATA") {
          inData = true;
          socket.write("354 go\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, recipients, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
