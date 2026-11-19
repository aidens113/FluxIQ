import { CommerceBillingError, PaymentProviderUnavailableError } from "fluxiq/platform";
import { payerOf } from "./payer-of";
import type { CommerceRouteAnswer, CommerceRouteDeps } from "./types";

/**
 * Starts a Checkout of one configured plan for the workspace's paying
 * account and answers where to send the person. The plan is named by its
 * configured id only; prices come from the commerce configuration. Checkout
 * returns the person to `/plans` with `checkout=success` or `checkout=cancel`.
 * `rawBody` is the request's JSON text; text that is not JSON is refused.
 */
export async function startCheckout(deps: CommerceRouteDeps, rawBody: string): Promise<CommerceRouteAnswer> {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof SyntaxError) return refuse(400, "commerce.invalid_request", "The request is not JSON.");
    throw error;
  }
  const planId = body !== null && typeof body === "object" ? (body as { planId?: unknown }).planId : undefined;
  if (typeof planId !== "string" || !Object.hasOwn(deps.config.plans, planId)) return refuse(400, "commerce.unknown_plan", "Choose one of the plans offered.");
  const accountId = await payerOf(deps);
  if (accountId === null) return refuse(409, "commerce.no_billing_account", "This workspace has no billing account of its own.");
  try {
    const checkout = await deps.billing.createCheckout({
      accountId,
      planId,
      successUrl: new URL("/plans?checkout=success", deps.publicOrigin).toString(),
      cancelUrl: new URL("/plans?checkout=cancel", deps.publicOrigin).toString()
    });
    return { status: 200, body: { ok: true, checkout: { checkoutId: checkout.checkoutId, url: checkout.url, expiresAtMs: checkout.expiresAtMs } } };
  } catch (error) {
    if (error instanceof CommerceBillingError && error.code === "unknown-plan") return refuse(400, "commerce.unknown_plan", "Choose one of the plans offered.");
    if (error instanceof PaymentProviderUnavailableError) return refuse(503, "commerce.provider_unavailable", "The payment provider did not answer. Try again in a moment.");
    throw error;
  }
}

function refuse(status: 400 | 404 | 409 | 503, code: string, error: string): CommerceRouteAnswer {
  return { status, body: { ok: false, code, error } };
}
