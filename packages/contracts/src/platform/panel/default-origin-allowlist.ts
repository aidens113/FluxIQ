import { CLIENT_GATEWAY_ANY_FIREFOX_EXTENSION_ENTRY } from "../origin/index.ts";
import type { PanelProduct } from "./panel-product.ts";

/**
 * The gateway's default Origin allowlist for a public profile: every origin
 * the product's `extensionClients` list, then `moz-extension://*` (Firefox ids
 * are per install), without duplicates. An explicit allowlist from the
 * operator replaces it.
 */
export function defaultClientGatewayOriginAllowlist(product: PanelProduct | null): string[] {
  const entries = (product?.extensionClients ?? []).flatMap((client) => client.origins);
  return [...new Set([...entries, CLIENT_GATEWAY_ANY_FIREFOX_EXTENSION_ENTRY])];
}
