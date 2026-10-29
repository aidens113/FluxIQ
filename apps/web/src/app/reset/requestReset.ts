import type { AccountLinkResponse } from "../welcome/server";
import { readJsonObject, refuse } from "../welcome/server";
import type { ResetDeps } from "./ResetDeps";

/**
 * Asks for a reset link. The answer is `{ ok: true }` whether or not the email
 * has an account, so the page cannot be used to find out who is registered.
 */
export async function requestReset(request: Request, deps: ResetDeps): Promise<AccountLinkResponse> {
  const body = await readJsonObject(request);
  if ("status" in body) return body as AccountLinkResponse;
  if (typeof body.email !== "string") return refuse(400, "bad_request");
  await deps.links.requestReset({ email: body.email });
  return { status: 200, body: { ok: true } };
}
