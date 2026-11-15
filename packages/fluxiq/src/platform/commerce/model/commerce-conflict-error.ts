/** An immutable event, customer binding or subscription version was reused. */
export class CommerceConflictError extends Error {
  constructor(readonly code: "event-reused" | "customer-rebound" | "subscription-rebound" | "version-reused") {
    super(`Commerce conflict: ${code}`);
    this.name = "CommerceConflictError";
  }
}
