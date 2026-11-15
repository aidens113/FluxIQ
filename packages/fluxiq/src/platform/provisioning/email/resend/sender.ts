import { createHash } from "node:crypto";
import type { EmailSender, PlatformEmailMessage } from "../../types.ts";
import { renderPlatformEmail } from "../render-platform-email.ts";
import { PlatformEmailDeliveryError } from "./error.ts";
import type { ResendEmailOptions } from "./options.ts";

/** HTTPS provider adapter. The caller owns durable delivery and retry policy. */
export class ResendEmailSender implements EmailSender {
  readonly kind = "resend";
  private readonly apiKey: string;
  private readonly from: string;
  private readonly templates: NonNullable<ResendEmailOptions["templates"]>;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: ResendEmailOptions) {
    if (!options.apiKey.trim() || /[\r\n]/u.test(options.apiKey)) throw new Error("A valid platform email API key is required.");
    if (!options.from.trim() || /[\r\n]/u.test(options.from)) throw new Error("A valid platform email sender address is required.");
    this.apiKey = options.apiKey.trim();
    this.from = options.from.trim();
    this.templates = options.templates ?? {};
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async send(message: PlatformEmailMessage): Promise<void> {
    const rendered = renderPlatformEmail(message, this.templates);
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" };
    if (message.deliveryId !== undefined) {
      if (!message.deliveryId.trim()) throw new Error("Platform email delivery identity must not be empty.");
      headers["idempotency-key"] = `fluxiq-mail-${createHash("sha256").update(message.deliveryId).digest("hex")}`;
    }
    let response: Response;
    try {
      response = await this.fetcher("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        headers,
        body: JSON.stringify({ from: this.from, to: [rendered.to], subject: rendered.subject, text: rendered.text })
      });
    } catch {
      // Provider/network errors can contain the request, including one-time links.
      throw new PlatformEmailDeliveryError("platform.email.transport");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => { /* best-effort: discard untrusted provider body */ });
      throw new PlatformEmailDeliveryError("platform.email.rejected", response.status);
    }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new PlatformEmailDeliveryError("platform.email.response"); }
    if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string" || !body.id.trim()) {
      throw new PlatformEmailDeliveryError("platform.email.response");
    }
  }
}
