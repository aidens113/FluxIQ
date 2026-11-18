import type { CommerceAllocationClass } from "fluxiq/platform";

/** One grant a plan gives; validity and dedicated resource ids come from the provider's subscription. */
export type CommerceGrantTemplate = {
  key: string;
  allocation: CommerceAllocationClass;
  capabilities: readonly string[];
  regions: readonly string[];
};

/** An operator-configured plan: the provider price it is sold as and what it grants. */
export type CommercePlan = { priceId: string; grants: readonly CommerceGrantTemplate[] };

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
  plans: CommercePlanCatalog;
  /** File holding the provider's API secret key (stripe only). */
  secretKeyFile: string | null;
  /** File holding the webhook signing secret. */
  webhookSecretFile: string;
  /** A Stripe-compatible API base other than Stripe's own, such as a local stripe-mock (stripe only). */
  apiBaseUrl: string | null;
};
