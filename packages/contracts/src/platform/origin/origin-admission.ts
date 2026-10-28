import type { FluxIQProfile } from "../profile.ts";
import type { ClientGatewayOriginRule } from "./origin-rule.ts";

/**
 * What the gateway's Origin decision depends on: the profile, whether the
 * gateway listens only on loopback, and the parsed allowlist.
 */
export type ClientGatewayOriginContext = {
  profile: FluxIQProfile;
  loopbackBind: boolean;
  rules: readonly ClientGatewayOriginRule[];
};

/** The Origin decision for one WebSocket upgrade. */
export type ClientGatewayOriginAdmission = { admitted: true } | { admitted: false; reason: "missing_origin" | "origin_not_allowed" };

const FIREFOX_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/u;

/**
 * True when the gateway is public: the `service` profile, or any profile bound
 * beyond loopback (self-hosted beyond loopback is treated as `service`). A
 * `service` gateway behind a proxy on loopback is still public.
 */
export function isPublicClientGatewayBind(context: Pick<ClientGatewayOriginContext, "profile" | "loopbackBind">): boolean {
  return context.profile === "service" || !context.loopbackBind;
}

/**
 * Decides one upgrade's Origin (hosted production plan, Gateway Transport;
 * the missing-Origin rule is the supervisor's decision of 2026-10-28, N7):
 *
 * - a missing or empty Origin is admitted only on a non-public gateway (`local`
 *   or `self-hosted` bound to loopback), and refused on a public one;
 * - a present Origin is admitted when an exact rule equals it, or the prefix
 *   rule's scheme starts it and one id with no `/` follows;
 * - with no rules at all, a non-public gateway admits every Origin (today's
 *   open loopback behaviour) and a public one admits none; a public gateway
 *   must not start that way (`clientGatewayOriginStartRefusal`).
 */
export function admitClientGatewayOrigin(origin: string | null | undefined, context: ClientGatewayOriginContext): ClientGatewayOriginAdmission {
  const isPublic = isPublicClientGatewayBind(context);
  if (origin === null || origin === undefined || origin === "") return isPublic ? { admitted: false, reason: "missing_origin" } : { admitted: true };
  if (context.rules.length === 0) return isPublic ? { admitted: false, reason: "origin_not_allowed" } : { admitted: true };
  return context.rules.some((rule) => ruleAdmits(rule, origin)) ? { admitted: true } : { admitted: false, reason: "origin_not_allowed" };
}

/**
 * Why the gateway must refuse to start with this allowlist, or null when it
 * may: a public gateway needs at least one rule, since without one no Origin
 * is ever admitted and the operator has misconfigured it.
 */
export function clientGatewayOriginStartRefusal(context: ClientGatewayOriginContext): string | null {
  if (!isPublicClientGatewayBind(context) || context.rules.length > 0) return null;
  return "A public FluxIQ client gateway needs an Origin allowlist; set the product's extension origins or FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS.";
}

function ruleAdmits(rule: ClientGatewayOriginRule, origin: string): boolean {
  if (rule.kind === "exact") return rule.origin === origin;
  return origin.startsWith(rule.prefix) && FIREFOX_ID_PATTERN.test(origin.slice(rule.prefix.length));
}
