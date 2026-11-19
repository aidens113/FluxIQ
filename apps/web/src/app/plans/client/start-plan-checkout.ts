import { CHECKOUT_PATH } from "./checkout-path";
import { readJsonAnswer } from "./read-json-answer";

/** Starts a Checkout of the plan and answers its URL, or the sentence why not. */
export async function startPlanCheckout(planId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(CHECKOUT_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId }) });
  } catch (error) {
    return { ok: false, error: `The server could not be reached (${error instanceof Error ? error.message : String(error)}).` };
  }
  const answer = await readJsonAnswer(response);
  const body = answer.body as { ok?: boolean; checkout?: { url?: string }; error?: string } | null;
  if (answer.ok && body?.ok === true && typeof body.checkout?.url === "string") return { ok: true, url: body.checkout.url };
  return { ok: false, error: body?.error ?? answer.unreadable ?? "The checkout could not be started." };
}
