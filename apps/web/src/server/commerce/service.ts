import path from "node:path";
import { CommerceBillingService, FakePaymentProvider, SQLiteCommerceLedger } from "fluxiq/platform";
import type { PaymentProvider } from "fluxiq/platform";
import { getFluxIQAfterReload } from "../../lib/fluxiq";
import { commerceCompositions as compositions } from "./compositions";
import { commerceConfig } from "./config";
import { readSecretFile } from "./read-secret-file";
import { StripePaymentProvider } from "./stripe";
import type { CommerceConfig } from "./types";

type Composition = { service: CommerceBillingService; stop(): void };

/**
 * The web server's billing service, or null when this server bills nothing.
 * The ledger lives at `<FluxIQ root>/platform/commerce`; secrets are read from
 * the files the configuration names. While composed, it reconciles every
 * subscription whose verification is due, so cloud admission's freshness
 * check holds between webhooks.
 */
export async function getCommerceBilling(): Promise<CommerceBillingService | null> {
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
  return (await pending).service;
}

async function compose(root: string): Promise<Composition> {
  const config = commerceConfig();
  if (config === null) throw new Error("commerce.configuration: FLUXIQ_COMMERCE_CONFIG_FILE is not set.");
  const service = new CommerceBillingService({
    ledger: new SQLiteCommerceLedger({ rootDir: path.join(root, "platform", "commerce") }),
    provider: await provider(config),
    policy: { allowTrial: config.allowTrial, graceMs: config.graceMs, retentionMs: config.retentionMs },
    refreshAfterMs: config.refreshAfterMs
  });
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
  return { service, stop: () => clearInterval(timer) };
}

async function provider(config: CommerceConfig): Promise<PaymentProvider> {
  const webhookSecret = await readSecretFile(config.webhookSecretFile, "webhook secret");
  if (config.provider === "fake") return new FakePaymentProvider({ webhookSecret });
  return new StripePaymentProvider({
    secretKey: await readSecretFile(config.secretKeyFile!, "Stripe secret key"),
    webhookSecret,
    plans: config.plans,
    apiBaseUrl: config.apiBaseUrl
  });
}
