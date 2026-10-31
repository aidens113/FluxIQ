import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EmailSender, PlatformEmailMessage } from "../types.ts";
import { renderPlatformEmail } from "./render-platform-email.ts";
import type { PlatformEmailTemplateOverrides } from "./types.ts";

/**
 * The `file` sender, the local stand-in's mailbox: each message is rendered
 * and written as one JSON file (`<ms>-<random>.json` holding template, to,
 * subject, text and sentAt, plus `welcomeUrl` as data when the message has
 * one) in `directory`, readable only by its owner. The text and the record
 * carry the message's links, so the directory is as private as a mailbox.
 * Nothing is logged.
 */
export class FileEmailSender implements EmailSender {
  readonly kind = "file";
  private readonly directory: string;
  private readonly templates: PlatformEmailTemplateOverrides;
  private readonly now: () => number;

  constructor(options: { directory: string; templates?: PlatformEmailTemplateOverrides; now?: () => number }) {
    this.directory = options.directory;
    this.templates = options.templates ?? {};
    this.now = options.now ?? Date.now;
  }

  async send(message: PlatformEmailMessage): Promise<void> {
    const rendered = renderPlatformEmail(message, this.templates);
    const sentAtMs = this.now();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const name = `${sentAtMs}-${randomBytes(6).toString("hex")}.json`;
    const welcomeUrl = message.variables.welcomeUrl;
    const body = {
      template: rendered.template,
      to: rendered.to,
      subject: rendered.subject,
      text: rendered.text,
      ...(typeof welcomeUrl === "string" ? { welcomeUrl } : {}),
      sentAt: new Date(sentAtMs).toISOString(),
    };
    await writeFile(join(this.directory, name), `${JSON.stringify(body, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  }
}
