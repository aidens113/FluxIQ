import type { EmailSender, PlatformEmailMessage } from "../types.ts";

/**
 * A test double: keeps every message, variables included, in arrival order.
 * `failNext` makes the next sends throw, for testing a failed delivery.
 */
export class MemoryEmailSender implements EmailSender {
  readonly kind = "memory";
  private readonly kept: PlatformEmailMessage[] = [];
  private failures = 0;

  get messages(): readonly PlatformEmailMessage[] {
    return this.kept;
  }

  failNext(count = 1): void {
    this.failures += count;
  }

  clear(): void {
    this.kept.length = 0;
  }

  async send(message: PlatformEmailMessage): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("MemoryEmailSender was told to fail this send.");
    }
    this.kept.push({ template: message.template, to: message.to, variables: { ...message.variables } });
  }
}
