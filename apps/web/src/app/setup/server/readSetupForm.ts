import { isCrossSiteRequest } from "../../welcome/server";
import type { SetupForm } from "./SetupForm";
import type { SetupResponse } from "./SetupResponse";

const FIELDS = ["code", "username", "displayName", "password", "confirmation"] as const;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_FIELD_LENGTH = 1024;

function refuse(status: number, code: string, fields?: string[]): SetupResponse {
  return { status, body: fields === undefined ? { ok: false, code } : { ok: false, code, fields } };
}

/** Same-site, a JSON object of at most 8 KiB, and five non-empty strings; a refusal names the fields at fault, never their values. */
export async function readSetupForm(request: Request): Promise<{ ok: true; form: SetupForm } | { ok: false; response: SetupResponse }> {
  if (isCrossSiteRequest(request)) return { ok: false, response: refuse(403, "forbidden") };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, response: refuse(413, "too_large") };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return { ok: false, response: refuse(413, "too_large") };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: refuse(400, "bad_request") };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, response: refuse(400, "bad_request") };
  const record = body as Record<string, unknown>;
  const fields = FIELDS.filter((name) => {
    const value = record[name];
    return typeof value !== "string" || value.trim() === "" || value.length > MAX_FIELD_LENGTH;
  });
  if (fields.length > 0) return { ok: false, response: refuse(400, "invalid_input", fields) };
  const value = (name: (typeof FIELDS)[number]) => record[name] as string;
  return {
    ok: true,
    form: { code: value("code"), username: value("username").trim(), displayName: value("displayName").trim(), password: value("password"), confirmation: value("confirmation") }
  };
}
