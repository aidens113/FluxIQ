/** Safe to report without copying provider bodies, mail contents or credentials. */
export class PlatformEmailDeliveryError extends Error {
  readonly code: "platform.email.transport" | "platform.email.rejected" | "platform.email.response";
  readonly status: number | undefined;

  constructor(code: PlatformEmailDeliveryError["code"], status?: number) {
    super(status === undefined ? "Platform email delivery was not confirmed." : `Platform email delivery was refused (HTTP ${status}).`);
    this.name = "PlatformEmailDeliveryError";
    this.code = code;
    this.status = status;
  }
}
