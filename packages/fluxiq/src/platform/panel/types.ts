import type { PanelEmailTemplate, PanelProduct } from "@fluxiq/contracts/platform";
import type { FluxIQ } from "../../framework/index.ts";
import type { PlatformEmailTemplateText, PlatformProvisioning } from "../provisioning/index.ts";

// The panel's extension points at launch (hosted production plan, Panel
// Customisation Extension Points; lane E, t814). Stable seam for lane E's
// workers and for the downstream product host module (`apps/product`):
// change it only with the lane E supervisor. A host module receives a
// `FluxIQPlatform`; the server reads and fires through the `PlatformRegistry`
// behind it. Hooks are asynchronous and failure-isolated: a handler that
// throws or rejects is logged by name and never fails the caller.

/** Where a `workspace.created` hook's work may start: the new workspace's own instance. */
export type PlatformHookPayloads = {
  "account.created": { accountId: string; userId: string; workspaceId: string };
  "workspace.created": { accountId: string; workspaceId: string; ownerUserId: string; fluxiq: FluxIQ };
  "account.disabled": { accountId: string; userId: string };
  "account.deleted": { accountId: string; userId: string };
  "client.connected": { accountId: string; userId: string; clientId: string };
  "client.revoked": { accountId: string; userId: string; clientId: string };
};

export type PlatformHookEvent = keyof PlatformHookPayloads;

export type PlatformHookHandler<TEvent extends PlatformHookEvent> = (payload: PlatformHookPayloads[TEvent]) => void | Promise<void>;

/** A human check (CAPTCHA-style) the website backend or sign-up path may consult. Provisional port: `verify` answers whether the token proves a human. */
export type PlatformHumanCheck = { id: string; verify(token: string, context: { sourceIp?: string }): Promise<boolean> };

/** The billing port. No-op until something is sold; provisional shape, `id` only. */
export type PlatformBillingProvider = { id: string };

/** The entitlement port: whether an account may use a named entitlement. Absent means allow all. */
export type PlatformEntitlementPolicy = { id: string; allows(accountId: string, entitlement: string): boolean | Promise<boolean> };

/** What `setProduct` accepts beside the manifest: where the product's asset files live (served at `/product/assets/<name>`). */
export type PlatformProductOptions = { assetsDir?: string };

/**
 * What a host module's `registerFluxIQPlatform(platform)` receives. Called
 * once per process, before any request or provisioning call.
 */
export type FluxIQPlatform = {
  /** Registers the product manifest, validated against `panelProductSchema` (an invalid manifest throws, so startup fails). Once per process; a second call throws. */
  setProduct(product: PanelProduct, options?: PlatformProductOptions): void;
  /** Subscribes to a lifecycle event. Many handlers per event are allowed, run in registration order. */
  on<TEvent extends PlatformHookEvent>(event: TEvent, handler: PlatformHookHandler<TEvent>): void;
  /** Supplies one email template (the manifest's `email.templates` entry wins when both give it). */
  registerEmailTemplate(name: PanelEmailTemplate, template: PlatformEmailTemplateText): void;
  registerHumanCheck(check: PlatformHumanCheck): void;
  registerBillingProvider(provider: PlatformBillingProvider): void;
  registerEntitlementPolicy(policy: PlatformEntitlementPolicy): void;
  /** The in-process provisioning service once the server has built it; null before (hooks and later calls see it). */
  readonly provisioning: PlatformProvisioning | null;
};

/** The server's side of the registry: reads what modules registered and fires hooks. */
export type PlatformRegistry = {
  /** The object handed to modules. */
  readonly platform: FluxIQPlatform;
  product(): PanelProduct | null;
  /** The directory holding the product's asset files, or null. */
  assetsDir(): string | null;
  /** Runs every handler for the event in order; a handler failure is isolated and logged by name, never thrown. */
  emit<TEvent extends PlatformHookEvent>(event: TEvent, payload: PlatformHookPayloads[TEvent]): Promise<void>;
  emailTemplates(): Partial<Readonly<Record<PanelEmailTemplate, PlatformEmailTemplateText>>>;
  humanChecks(): readonly PlatformHumanCheck[];
  billingProvider(): PlatformBillingProvider | null;
  entitlementPolicy(): PlatformEntitlementPolicy | null;
  /** The server calls this once it has built the provisioning service. */
  attachProvisioning(provisioning: PlatformProvisioning): void;
};
