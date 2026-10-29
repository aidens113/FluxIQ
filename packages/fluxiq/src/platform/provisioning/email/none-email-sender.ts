import type { EmailSender, PlatformEmailMessage } from "../types.ts";

/** The `none` sender: mail is turned off, so every message is discarded, by configuration rather than by failure. */
export class NoneEmailSender implements EmailSender {
  readonly kind = "none";

  async send(_message: PlatformEmailMessage): Promise<void> {
    return Promise.resolve();
  }
}
