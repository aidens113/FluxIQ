import type { AccountLinkResponse } from "./accountLinkResponse";
import { isCrossSiteRequest } from "./isCrossSiteRequest";
import { readLimitedJson } from "./readLimitedJson";
import { refuse } from "./refuse";

/** The largest JSON body the account-link routes read. */
const MAX_BODY_BYTES = 8 * 1024;

/** The checks every account-link route starts with: same-site, and a JSON object body of at most 8 KiB. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | AccountLinkResponse> {
  if (isCrossSiteRequest(request)) return refuse(403, "forbidden");
  const body = await readLimitedJson(request, MAX_BODY_BYTES);
  if (!body.ok) return refuse(body.code === "too_large" ? 413 : 400, body.code);
  if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) return refuse(400, "bad_request");
  return body.value as Record<string, unknown>;
}
