import type { CommerceBillingService, PlatformStore } from "fluxiq/platform";
import type { CommerceConfig } from "../../../../../../server/commerce";

/** What the checkout routes reach, resolved for one request after its IAM decision. */
export type CommerceRouteDeps = {
  /** The caller's workspace, from its held session, never the request. */
  workspaceId: string;
  billing: Pick<CommerceBillingService, "createCheckout" | "getEntitlement" | "listCheckouts">;
  config: Pick<CommerceConfig, "plans">;
  workspaces: Pick<PlatformStore, "getWorkspace">;
  /** The panel's public origin, which Checkout returns the person to. */
  publicOrigin: string;
  now(): number;
};

/** A route answer: the status and the JSON body. */
export type CommerceRouteAnswer = { status: 200 | 400 | 404 | 409 | 503; body: unknown };
