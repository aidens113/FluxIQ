export type LimitedJson = { ok: true; value: unknown } | { ok: false; code: "too_large" | "bad_request" };

/** Reads a JSON body of at most `maxBytes`; a larger or malformed body is a typed refusal. */
export async function readLimitedJson(request: Request, maxBytes: number): Promise<LimitedJson> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, code: "too_large" };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return { ok: false, code: "too_large" };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "bad_request" };
  }
}
