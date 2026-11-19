import type { FormRead } from "./FormRead";
import { readJsonObject } from "./readJsonObject";
import { refuse } from "./refuse";

/** The checks both link-redeeming routes start with: same-site, a small JSON body, and string `token` and `password`. */
export async function readTokenAndPassword(request: Request): Promise<FormRead<{ token: string; password: string }>> {
  const read = await readJsonObject(request);
  if (!read.ok) return read;
  const { token, password } = read.value;
  if (typeof token !== "string" || typeof password !== "string") return { ok: false, response: refuse(400, "bad_request") };
  return { ok: true, value: { token, password } };
}
