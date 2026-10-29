// Barrel for provisioning email: the stock templates and their renderer, and
// the `EmailSender` implementations (`none`, `file`, and a memory test double).
export * from "./file-email-sender.ts";
export * from "./memory-email-sender.ts";
export * from "./none-email-sender.ts";
export * from "./render-platform-email.ts";
export * from "./stock-email-templates.ts";
export type * from "./types.ts";
