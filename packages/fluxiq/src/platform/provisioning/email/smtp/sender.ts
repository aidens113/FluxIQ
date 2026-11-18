import { createHash, randomUUID } from "node:crypto";
import { connect as connectPlain, isIP } from "node:net";
import type { Duplex } from "node:stream";
import { connect as connectTls, rootCertificates } from "node:tls";
import type { EmailSender, PlatformEmailMessage } from "../../types.ts";
import { renderPlatformEmail } from "../render-platform-email.ts";
import type { PlatformEmailTemplateOverrides } from "../types.ts";
import { composeSmtpMessage } from "./compose-smtp-message.ts";
import { envelopeAddress } from "./envelope-address.ts";
import { SmtpEmailDeliveryError } from "./error.ts";
import { SmtpReplyReader } from "./smtp-reply-reader.ts";
import type { SmtpCredentials, SmtpEmailOptions, SmtpEndpoint } from "./types.ts";

type Hello = { extensions: ReadonlySet<string>; mechanisms: ReadonlySet<string> };

/**
 * Delivers over SMTP: a local mail sink (`smtp://mailpit:1025`) or a real
 * relay (`smtp+starttls://smtp.example.org:587` with credentials). One
 * connection per message; the caller owns durable delivery and retry policy.
 * Credentials are refused on a plain connection, STARTTLS is required when
 * asked for, and a failure reports only the SMTP reply code.
 */
export class SmtpEmailSender implements EmailSender {
  readonly kind = "smtp";
  private readonly endpoint: SmtpEndpoint;
  private readonly from: string;
  private readonly fromAddress: string;
  private readonly auth: SmtpCredentials | undefined;
  private readonly trusted: string[] | undefined;
  private readonly clientName: string;
  private readonly templates: PlatformEmailTemplateOverrides;

  constructor(options: SmtpEmailOptions) {
    this.fromAddress = senderAddress(options.from);
    if (options.auth !== undefined) {
      if (options.endpoint.security === "plain") throw new Error("SMTP credentials need smtp+starttls:// or smtps://; they are never sent unencrypted.");
      const { username, secret } = options.auth;
      if (!username.trim() || /[\r\n]/u.test(username) || !secret || /[\r\n]/u.test(secret)) throw new Error("Valid SMTP credentials are required.");
    }
    const clientName = options.clientName ?? this.fromAddress.slice(this.fromAddress.lastIndexOf("@") + 1);
    if (!/^[A-Za-z0-9.-]+$/u.test(clientName)) throw new Error("The SMTP client name must be a host name.");
    this.endpoint = options.endpoint;
    this.from = options.from.trim();
    this.auth = options.auth;
    this.trusted = options.trustedCertificates === undefined ? undefined : [...rootCertificates, options.trustedCertificates];
    this.clientName = clientName;
    this.templates = options.templates ?? {};
  }

  async send(message: PlatformEmailMessage): Promise<void> {
    if (message.deliveryId !== undefined && !message.deliveryId.trim()) throw new Error("Platform email delivery identity must not be empty.");
    const rendered = renderPlatformEmail(message, this.templates);
    const recipient = envelopeAddress(rendered.to);
    const data = composeSmtpMessage(rendered, { from: this.from, messageId: this.messageId(message.deliveryId), date: new Date() });
    const reader = new SmtpReplyReader();
    let stream = await this.open(reader);
    try {
      await expectReply(reader, [220]);
      let hello = await this.hello(stream, reader);
      if (this.endpoint.security === "starttls") {
        if (!hello.extensions.has("STARTTLS")) throw new SmtpEmailDeliveryError("platform.email.security");
        await command(stream, reader, "STARTTLS", [220]);
        reader.release();
        stream = await this.upgrade(stream);
        reader.attach(stream);
        hello = await this.hello(stream, reader);
      }
      if (this.auth !== undefined) await authenticate(stream, reader, hello.mechanisms, this.auth);
      await command(stream, reader, `MAIL FROM:<${this.fromAddress}>`, [250]);
      await command(stream, reader, `RCPT TO:<${recipient}>`, [250, 251]);
      await command(stream, reader, "DATA", [354]);
      stream.write(`${data}.\r\n`);
      await expectReply(reader, [250]);
      await command(stream, reader, "QUIT", [221]).catch(/* best-effort: the message was accepted at the 250 above; a server that hangs up before 221 changes nothing */ () => undefined);
    } finally {
      reader.release();
      stream.destroy();
    }
  }

  private messageId(deliveryId: string | undefined): string {
    const domain = this.fromAddress.slice(this.fromAddress.lastIndexOf("@") + 1);
    const local = deliveryId === undefined ? randomUUID() : `fluxiq-mail-${createHash("sha256").update(deliveryId).digest("hex")}`;
    return `<${local}@${domain}>`;
  }

  private open(reader: SmtpReplyReader): Promise<Duplex> {
    const { host, port, security } = this.endpoint;
    return new Promise((resolve, reject) => {
      const socket = security === "tls" ? connectTls({ host, port, ...this.tlsOptions() }) : connectPlain({ host, port });
      const failed = () => {
        socket.destroy();
        reject(new SmtpEmailDeliveryError("platform.email.transport"));
      };
      socket.once("error", failed);
      socket.once(security === "tls" ? "secureConnect" : "connect", () => {
        socket.off("error", failed);
        reader.attach(socket);
        resolve(socket);
      });
    });
  }

  private upgrade(plain: Duplex): Promise<Duplex> {
    return new Promise((resolve, reject) => {
      const secure = connectTls({ socket: plain, ...this.tlsOptions() });
      const failed = () => {
        secure.destroy();
        reject(new SmtpEmailDeliveryError("platform.email.security"));
      };
      secure.once("error", failed);
      secure.once("secureConnect", () => {
        secure.off("error", failed);
        resolve(secure);
      });
    });
  }

  private tlsOptions(): { servername?: string; ca?: string[] } {
    const options: { servername?: string; ca?: string[] } = {};
    if (isIP(this.endpoint.host) === 0) options.servername = this.endpoint.host;
    if (this.trusted !== undefined) options.ca = this.trusted;
    return options;
  }

  private async hello(stream: Duplex, reader: SmtpReplyReader): Promise<Hello> {
    stream.write(`EHLO ${this.clientName}\r\n`);
    const reply = await reader.next();
    if (reply.code !== 250) {
      if (this.endpoint.security !== "plain") throw new SmtpEmailDeliveryError("platform.email.rejected", reply.code);
      await command(stream, reader, `HELO ${this.clientName}`, [250]);
      return { extensions: new Set(), mechanisms: new Set() };
    }
    const extensions = new Set<string>();
    const mechanisms = new Set<string>();
    for (const line of reply.lines.slice(1)) {
      const [keyword = "", ...rest] = line.trim().toUpperCase().split(/\s+/u);
      extensions.add(keyword);
      if (keyword === "AUTH") for (const mechanism of rest) mechanisms.add(mechanism);
    }
    return { extensions, mechanisms };
  }
}

function senderAddress(from: string): string {
  try { return envelopeAddress(from); }
  catch { throw new Error("A valid platform email sender address is required."); }
}

async function expectReply(reader: SmtpReplyReader, codes: readonly number[]): Promise<void> {
  const reply = await reader.next();
  if (!codes.includes(reply.code)) throw new SmtpEmailDeliveryError("platform.email.rejected", reply.code);
}

async function command(stream: Duplex, reader: SmtpReplyReader, line: string, codes: readonly number[]): Promise<void> {
  stream.write(`${line}\r\n`);
  await expectReply(reader, codes);
}

async function authenticate(stream: Duplex, reader: SmtpReplyReader, mechanisms: ReadonlySet<string>, auth: SmtpCredentials): Promise<void> {
  const encode = (text: string) => Buffer.from(text, "utf8").toString("base64");
  if (mechanisms.has("PLAIN")) {
    await command(stream, reader, `AUTH PLAIN ${encode(`\u0000${auth.username}\u0000${auth.secret}`)}`, [235]);
    return;
  }
  if (mechanisms.has("LOGIN")) {
    await command(stream, reader, "AUTH LOGIN", [334]);
    await command(stream, reader, encode(auth.username), [334]);
    await command(stream, reader, encode(auth.secret), [235]);
    return;
  }
  throw new SmtpEmailDeliveryError("platform.email.security");
}
