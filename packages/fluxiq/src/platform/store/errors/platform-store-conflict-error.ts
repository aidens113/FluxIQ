/** Thrown by `putAccount` when the email or externalId already names another account. */
export class PlatformStoreConflictError extends Error {
  readonly field: "email" | "externalId";

  constructor(field: "email" | "externalId", message?: string) {
    super(message ?? `Another account already uses this ${field}.`);
    this.name = "PlatformStoreConflictError";
    this.field = field;
  }
}
