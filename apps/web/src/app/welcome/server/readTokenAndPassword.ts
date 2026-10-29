import type { AccountLinkResponse } from "./accountLinkResponse";
import { readJsonObject } from "./readJsonObject";
import { refuse } from "./refuse";

/** The checks both link-redeeming routes start with: same-site, a small JSON body, and string `token` and `password`. */
export async function readTokenAndPassword(request: Request): Promise<{ token: string; password: string } | AccountLinkResponse> {
  const body = await readJsonObject(request);
  if ("status" in body) return body as AccountLinkResponse;
  if (typeof body.token !== "string" || typeof body.password !== "string") return refuse(400, "bad_request");
  return { token: body.token, password: body.password };
}
