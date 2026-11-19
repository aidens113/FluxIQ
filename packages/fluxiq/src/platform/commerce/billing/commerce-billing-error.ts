/** A billing request that cannot be served as asked; never a payment-state decision. */
export class CommerceBillingError extends Error {
  constructor(readonly code: "unknown-plan" | "no-customer" | "subscription-missing-at-provider" | "subscription-unbound" | "invalid-request") {
    super(`Commerce billing: ${code}`);
    this.name = "CommerceBillingError";
  }
}
