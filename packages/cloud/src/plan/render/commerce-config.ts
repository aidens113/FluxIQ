import type { CloudConfig } from "../../config/index.ts";

const STRIPE_API = "https://api.stripe.com";

/**
 * The commerce configuration Core's billing reads (the JSON file named by
 * FLUXIQ_COMMERCE_CONFIG_FILE, apps/web/src/server/commerce/config.ts), or
 * null when the config has no `billing` section. It names the secret files
 * by their mount path and holds no secret. `apiBaseUrl` is set only where
 * the payments API is not Stripe's own (the stripe-mock sink). Core's file
 * names every key it reads, so a value the config leaves out is left out
 * here and takes Core's default.
 */
export function renderCommerceConfig(config: CloudConfig): string | null {
  const billing = config.billing;
  if (billing === null) return null;
  if (config.payments === null) throw new Error("A billing section needs the payments section (a service).");
  const stripe = billing.provider === "stripe";
  const apiBase = new URL(config.payments.apiBase).origin;
  const value: Record<string, unknown> = {
    provider: billing.provider,
    allowTrial: billing.allowTrial,
    graceMs: billing.graceMs,
    retentionMs: billing.retentionMs,
    refreshAfterMs: billing.refreshAfterMs,
    ...(billing.maxVerificationAgeMs === null ? {} : { maxVerificationAgeMs: billing.maxVerificationAgeMs }),
    ...(billing.checkoutLifetimeMs === null ? {} : { checkoutLifetimeMs: billing.checkoutLifetimeMs }),
    ...(billing.region === null ? {} : { region: billing.region }),
    plans: Object.fromEntries(Object.entries(billing.plans).map(([id, plan]) => [id, {
      ...(plan.name === null ? {} : { name: plan.name }),
      priceId: plan.priceId,
      unit: plan.unit,
      quantity: plan.quantity,
      grants: plan.grants
    }])),
    ...(stripe ? { secretKeyFile: "/run/secrets/stripe_secret_key" } : {}),
    webhookSecretFile: "/run/secrets/stripe_webhook_secret",
    ...(stripe && apiBase !== STRIPE_API ? { apiBaseUrl: apiBase } : {})
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}
