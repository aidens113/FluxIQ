/**
 * Safe to report: it carries the SMTP reply code, never the server's words,
 * which can echo addresses, links or credentials back.
 */
export class SmtpEmailDeliveryError extends Error {
  readonly code: "platform.email.transport" | "platform.email.rejected" | "platform.email.response" | "platform.email.security";
  readonly replyCode: number | undefined;

  constructor(code: SmtpEmailDeliveryError["code"], replyCode?: number) {
    super(messageFor(code, replyCode));
    this.name = "SmtpEmailDeliveryError";
    this.code = code;
    this.replyCode = replyCode;
  }
}

function messageFor(code: SmtpEmailDeliveryError["code"], replyCode: number | undefined): string {
  if (code === "platform.email.security") return "The mail server does not offer the encryption or sign-in this sender requires.";
  if (replyCode !== undefined) return `Platform email delivery was refused (SMTP ${replyCode}).`;
  return "Platform email delivery was not confirmed.";
}
