import { CommerceConflictError, PaymentWebhookVerificationError } from "fluxiq/platform";
import { getCommerceBilling } from "../../../../../../server/commerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The payment provider's webhook. No cookie, bearer token or actor: the
 * provider's signature over the exact raw body is the only proof, and the body
 * is a trigger, never state (the billing service fetches the subscription's
 * current state). 2xx tells the provider to stop retrying; a failure to apply
 * answers 5xx so the provider delivers again.
 */
export async function POST(request: Request): Promise<Response> {
  let billing;
  try {
    billing = await getCommerceBilling();
  } catch (error) {
    console.error(`[commerce] billing is misconfigured: ${error instanceof Error ? error.message : String(error)}`);
    return failure(503, "commerce.unavailable", "Billing is unavailable.");
  }
  if (billing === null) return failure(404, "commerce.disabled", "This server does not bill.");
  const rawBody = await request.text();
  try {
    const result = await billing.ingestWebhook(rawBody, request.headers.get("stripe-signature"));
    return Response.json({ received: true, outcome: result.outcome }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof PaymentWebhookVerificationError) return failure(400, "commerce.unverified", "The webhook signature could not be verified.");
    if (error instanceof CommerceConflictError) {
      console.error(`[commerce] webhook conflicts with the ledger: ${error.code}`);
      return failure(409, "commerce.conflict", "The webhook conflicts with recorded billing state.");
    }
    console.error(`[commerce] webhook could not be applied: ${error instanceof Error ? error.message : String(error)}`);
    return failure(500, "commerce.failed", "The webhook could not be applied.");
  }
}

function failure(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}
