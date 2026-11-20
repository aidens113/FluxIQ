import type { FormRead } from "./FormRead";
import { isCrossSiteRequest } from "./isCrossSiteRequest";
import { readLimitedJson } from "./readLimitedJson";
import { refuse } from "./refuse";

/** The largest JSON body the account-link routes read. */
const MAX_BODY_BYTES = 8 * 1024;

/** The checks every account-link route starts with: same-site, and a JSON object body of at most 8 KiB. The body is data only. */
export async function readJsonObject(request: Request): Promise<FormRead<Record<string, unknown>>> {
  if (isCrossSiteRequest(request)) return { ok: false, response: refuse(403, "forbidden") };
  const body = await readLimitedJson(request, MAX_BODY_BYTES);
  if (!body.ok) return { ok: false, response: refuse(body.code === "too_large" ? 413 : 400, body.code) };
  if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) return { ok: false, response: refuse(400, "bad_request") };
  return { ok: true, value: body.value as Record<string, unknown> };
}
