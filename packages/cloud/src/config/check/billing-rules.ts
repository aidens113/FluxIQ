import type { CloudConfigFile, CloudConfigIssue } from "../types.ts";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

/**
 * The rules of the `billing` section and of the secret files it needs, run
 * after the schema passed. They mirror what Core's commerce configuration
 * refuses, so a bad value fails here naming the field, not at Core's start,
 * and they keep a production config off the fake provider.
 */
export function checkBillingRules(file: CloudConfigFile): CloudConfigIssue[] {
  const billing = file.billing;
  // A self-hosted server bills nothing; checkModeRules refuses the section there.
  if (billing === undefined || file.mode === "self-hosted") return [];
  const issues: CloudConfigIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const paymentsSink = file.sinks?.payments === true;
  if (billing.provider === "fake" && file.profile !== "local") add("billing.provider", 'must be "stripe" on the production profile: the fake provider takes no real money');
  const webhookSecretFile = file.payments?.webhookSecretFile;
  if (!paymentsSink && webhookSecretFile === undefined) {
    add("payments.webhookSecretFile", "is required with billing unless the stripe-mock sink runs: it is the signing secret of this endpoint");
  }
  if (paymentsSink && webhookSecretFile !== undefined) add("payments.webhookSecretFile", "is generated while the stripe-mock sink runs; leave it out");
  if (billing.maxVerificationAgeMs !== undefined && billing.maxVerificationAgeMs <= billing.refreshAfterMs) {
    add("billing.maxVerificationAgeMs", `must exceed billing.refreshAfterMs (${billing.refreshAfterMs}): admission would refuse a subscription before it is due to be refreshed`);
  }
  const plans = Object.entries(billing.plans);
  if (plans.length === 0) add("billing.plans", "must name at least one plan");
  const prices = new Set<string>();
  for (const [planId, plan] of plans) {
    if (!IDENTIFIER.test(planId)) add(`billing.plans.${planId}`, "is not a valid plan id (letters, digits, dot, dash, underscore)");
    if (prices.has(plan.priceId)) add(`billing.plans.${planId}.priceId`, "is used by another plan");
    prices.add(plan.priceId);
    if (plan.unit === "dedicated-browser" && !plan.grants.some((grant) => grant.allocation === "dedicated")) {
      add(`billing.plans.${planId}.grants`, 'must include a dedicated grant: a "dedicated-browser" price counts dedicated browsers');
    }
    plan.grants.forEach((grant, index) => {
      const at = `billing.plans.${planId}.grants[${index}]`;
      const regions = grant.regions ?? [];
      if (grant.allocation !== "control" && regions.length === 0) add(`${at}.regions`, "must name a region unless the allocation is control");
      if (new Set(grant.capabilities).size !== grant.capabilities.length) add(`${at}.capabilities`, "has a duplicate");
      if (new Set(regions).size !== regions.length) add(`${at}.regions`, "has a duplicate");
    });
  }
  return issues;
}
