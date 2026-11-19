import { CHECKOUT_PATH } from "./checkout-path";
import { readJsonAnswer } from "./read-json-answer";
import type { BillingStatusAnswer, PlanAccount, PlanOffer } from "./types";

/** Reads the plans and the workspace's billing; a refusal answers its status and the server's sentence. */
export async function readBillingStatus(): Promise<BillingStatusAnswer> {
  let response: Response;
  try {
    response = await fetch(CHECKOUT_PATH, { cache: "no-store" });
  } catch (error) {
    return { ok: false, status: 0, error: `The server could not be reached (${error instanceof Error ? error.message : String(error)}).` };
  }
  const answer = await readJsonAnswer(response);
  const body = answer.body as { ok?: boolean; plans?: PlanOffer[]; account?: PlanAccount | null; error?: string } | null;
  if (answer.ok && body?.ok === true && Array.isArray(body.plans)) return { ok: true, plans: body.plans, account: body.account ?? null };
  return { ok: false, status: answer.status, error: body?.error ?? answer.unreadable ?? "Billing could not be read." };
}
