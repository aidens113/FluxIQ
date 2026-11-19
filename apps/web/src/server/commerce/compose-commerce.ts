import path from "node:path";
import { CloudAdmissionService, CommerceBillingService, FakePaymentProvider, SQLiteCommerceLedger } from "fluxiq/platform";
import type { PaymentProvider } from "fluxiq/platform";
import { getFluxIQAfterReload } from "../../lib/fluxiq";
import { hostedCloudAuthorizer, platformWorkspaces } from "../environments/authority";
import { getEnvironmentStore } from "../environments";
import { getEnvironmentHoldings } from "../environments/holdings";
import { cloudAdmissionPolicy } from "./cloud/admission-policy";
import { delegatingCloudAuthorizer } from "./cloud/delegating-authorizer";
import { setCloudAuthorizer } from "./cloud/set-authorizer";
import { commerceCompositions as compositions } from "./compositions";
import type { CommerceComposition } from "./compositions";
import { commerceConfig } from "./config";
import { readSecretFile } from "./read-secret-file";
import { StripePaymentProvider } from "./stripe";
import type { CommerceConfig } from "./types";

/**
 * The commerce composition, built once per FluxIQ root and configuration
 * file: the billing service and cloud admission over ONE ledger and ONE
 * configuration, or null when this server bills nothing. The ledger lives at
 * `<FluxIQ root>/platform/commerce`; secrets are read from the files the
 * configuration names. Admission counts dedicated browsers against the
 * root's environment holdings (what each account's environments hold), and
 * composing installs the hosted IAM resolver (`setCloudAuthorizer`). While
 * composed it reconciles every subscription whose
 * verification is due, so cloud admission's freshness check holds between
 * webhooks.
 */
export async function composedCommerce(): Promise<CommerceComposition | null> {
  const configFile = process.env.FLUXIQ_COMMERCE_CONFIG_FILE?.trim();
  if (!configFile) return null;
  const fluxiq = await getFluxIQAfterReload();
  const root = path.resolve(fluxiq.paths.fluxiq);
  const key = JSON.stringify([root, path.resolve(configFile)]);
  let pending = compositions.get(key);
  if (!pending) {
    pending = compose(root);
    compositions.set(key, pending);
    void pending.catch(() => { if (compositions.get(key) === pending) compositions.delete(key); });
  }
  return pending;
}

async function compose(root: string): Promise<CommerceComposition> {
  const config = commerceConfig();
  if (config === null) throw new Error("commerce.configuration: FLUXIQ_COMMERCE_CONFIG_FILE is not set.");
  const policy = cloudAdmissionPolicy(config);
  const ledger = new SQLiteCommerceLedger({ rootDir: path.join(root, "platform", "commerce") });
  const service = new CommerceBillingService({
    ledger,
    provider: await provider(config),
    policy: { allowTrial: config.allowTrial, graceMs: config.graceMs, retentionMs: config.retentionMs },
    refreshAfterMs: config.refreshAfterMs
  });
  const admission = new CloudAdmissionService<unknown>({ deploymentMode: "service", authorize: delegatingCloudAuthorizer, ledger, policy, holdings: getEnvironmentHoldings(root) });
  // The hosted IAM resolver for dedicated environments; with no plan granting one there is no region, and admission refuses them all.
  if (config.region !== null) setCloudAuthorizer(hostedCloudAuthorizer({ workspaces: platformWorkspaces, environments: getEnvironmentStore(root), region: config.region }));
  let running = false;
  const reconcile = async () => {
    if (running) return;
    running = true;
    try {
      const report = await service.reconcileDue();
      for (const failure of report.failed) console.error(`[commerce] reconciliation of ${failure.subscriptionId} failed: ${failure.error}`);
    } catch (error) {
      console.error(`[commerce] reconciliation pass failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };
  // Half the refresh interval: a subscription is reconciled within one interval of falling due.
  const timer = setInterval(() => void reconcile(), Math.max(1, Math.floor(config.refreshAfterMs / 2)));
  timer.unref();
  return { service, admission, stop: () => clearInterval(timer) };
}

async function provider(config: CommerceConfig): Promise<PaymentProvider> {
  const webhookSecret = await readSecretFile(config.webhookSecretFile, "webhook secret");
  if (config.provider === "fake") return new FakePaymentProvider({ webhookSecret, checkoutLifetimeMs: config.checkoutLifetimeMs });
  return new StripePaymentProvider({
    secretKey: await readSecretFile(config.secretKeyFile!, "Stripe secret key"),
    webhookSecret,
    plans: config.plans,
    apiBaseUrl: config.apiBaseUrl,
    checkoutLifetimeMs: config.checkoutLifetimeMs
  });
}
