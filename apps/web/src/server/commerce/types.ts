import type { CommerceAllocationClass } from "fluxiq/platform";

/** One grant a plan gives; validity and dedicated resource ids come from the provider's subscription. */
export type CommerceGrantTemplate = {
  key: string;
  allocation: CommerceAllocationClass;
  capabilities: readonly string[];
  regions: readonly string[];
};

/**
 * What one price of a plan counts: a dedicated browser each, a seat each, or
 * nothing (a flat price for the whole plan). The provider's item quantity is
 * the count. Prices are the operator's configuration, never code.
 */
export type CommercePlanUnit = "dedicated-browser" | "seat" | "flat";

/**
 * One line item of a plan: the provider price it is sold as, what that price
 * counts, how many of it the checkout sells, and what it grants. A counted
 * line's grants carry the provider's item quantity (dedicated browsers,
 * seats), so the subscription's own count, never this file's, is what admits.
 */
export type CommercePlanLine = { priceId: string; unit: CommercePlanUnit; quantity: number; grants: readonly CommerceGrantTemplate[] };

/**
 * An operator-configured plan a person can choose: its display name and its
 * line items (a per-dedicated-browser price, optionally a seat price).
 */
export type CommercePlan = { name: string; lines: readonly CommercePlanLine[] };

export type CommercePlanCatalog = Readonly<Record<string, CommercePlan>>;

/**
 * The web server's billing configuration, read from the JSON file named by
 * `FLUXIQ_COMMERCE_CONFIG_FILE`. Secrets are never in it: it names the files
 * that hold them.
 */
export type CommerceConfig = {
  provider: "stripe" | "fake";
  allowTrial: boolean;
  graceMs: number;
  retentionMs: number;
  refreshAfterMs: number;
  /**
   * How old a verification cloud admission still trusts. Always exceeds
   * refreshAfterMs (the file is refused otherwise); twice refreshAfterMs when
   * the file names none, so a subscription reconciled within one interval of
   * falling due is never refused for age in between.
   */
  maxVerificationAgeMs: number;
  plans: CommercePlanCatalog;
  /** File holding the provider's API secret key (stripe only). */
  secretKeyFile: string | null;
  /** File holding the webhook signing secret. */
  webhookSecretFile: string;
  /** A Stripe-compatible API base other than Stripe's own, such as a local stripe-mock (stripe only). */
  apiBaseUrl: string | null;
  /** How long a checkout stays payable once started (30 minutes to 24 hours, Stripe's bounds); one hour when the file names none. */
  checkoutLifetimeMs: number;
  /**
   * The region this deployment's dedicated environments run in, which their
   * admission matches against grants; when the file names none, the one
   * region every dedicated grant names (the file is refused when they differ).
   * Null when no plan grants a dedicated environment.
   */
  region: string | null;
};
