import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { panelProductSchema, type PanelEmailTemplate, type PanelProduct } from "@fluxiq/contracts/platform";
import type { PlatformEmailTemplateText, PlatformProvisioning } from "../../provisioning/index.ts";
import { checkPanelBrandContrast } from "../brand/index.ts";
import type { FluxIQPlatform, PlatformBillingProvider, PlatformEntitlementPolicy, PlatformHookEvent, PlatformHookHandler, PlatformHookPayloads, PlatformHumanCheck, PlatformProductOptions, PlatformRegistry } from "../types.ts";

type AnyHandler = (payload: never) => void | Promise<void>;

function validateAssets(product: PanelProduct, assetsDir: string): void {
  if (!path.isAbsolute(assetsDir) || !existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
    throw new Error(`Product assetsDir must be an absolute existing directory: ${assetsDir}`);
  }
  for (const name of Object.values(product.assets ?? {})) {
    if (name && !existsSync(path.join(assetsDir, name))) throw new Error(`Product asset file is missing from assetsDir: ${name} (${assetsDir})`);
  }
}

/** A fresh registry. Production code reaches the process-wide one through `getPlatformRegistry`. */
export function createPlatformRegistry(): PlatformRegistry {
  let product: PanelProduct | null = null;
  let assetsDir: string | null = null;
  let provisioning: PlatformProvisioning | null = null;
  let billing: PlatformBillingProvider | null = null;
  let entitlement: PlatformEntitlementPolicy | null = null;
  const handlers = new Map<PlatformHookEvent, AnyHandler[]>();
  const registeredTemplates: Partial<Record<PanelEmailTemplate, PlatformEmailTemplateText>> = {};
  const checks: PlatformHumanCheck[] = [];

  const platform: FluxIQPlatform = {
    setProduct(candidate: PanelProduct, options?: PlatformProductOptions): void {
      if (product) throw new Error("The panel product is already set; setProduct may be called once per process.");
      const parsed = panelProductSchema.parse(candidate);
      const contrast = checkPanelBrandContrast(parsed);
      if (!contrast.ok) throw new Error(`Product brand colours fail the panel's contrast check: ${contrast.failures.join("; ")}`);
      if (options?.assetsDir !== undefined) validateAssets(parsed, options.assetsDir);
      product = parsed;
      assetsDir = options?.assetsDir ?? null;
    },
    on<TEvent extends PlatformHookEvent>(event: TEvent, handler: PlatformHookHandler<TEvent>): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler as AnyHandler]);
    },
    registerEmailTemplate(name, template): void {
      registeredTemplates[name] = template;
    },
    registerHumanCheck(check): void {
      if (checks.some((existing) => existing.id === check.id)) throw new Error(`A human check with id ${JSON.stringify(check.id)} is already registered.`);
      checks.push(check);
    },
    registerBillingProvider(provider): void {
      if (billing) throw new Error("A billing provider is already registered.");
      billing = provider;
    },
    registerEntitlementPolicy(policy): void {
      if (entitlement) throw new Error("An entitlement policy is already registered.");
      entitlement = policy;
    },
    get provisioning(): PlatformProvisioning | null {
      return provisioning;
    }
  };

  return {
    platform,
    product: () => product,
    assetsDir: () => assetsDir,
    async emit<TEvent extends PlatformHookEvent>(event: TEvent, payload: PlatformHookPayloads[TEvent]): Promise<void> {
      const list = handlers.get(event) ?? [];
      for (const [index, handler] of list.entries()) {
        try {
          await (handler as (payload: PlatformHookPayloads[TEvent]) => void | Promise<void>)(payload);
        } catch {
          // Name only: the payload may carry account data.
          console.error(`Platform hook failed: event ${event}, handler ${index}`);
        }
      }
    },
    emailTemplates: () => ({ ...registeredTemplates, ...(product?.email?.templates ?? {}) }),
    humanChecks: () => [...checks],
    billingProvider: () => billing,
    entitlementPolicy: () => entitlement,
    attachProvisioning(value): void {
      provisioning = value;
    }
  };
}
