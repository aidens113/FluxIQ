import { KeySessionError } from "fluxiq/platform";
import { keySessionConfig } from "./config";
import { keyManagementContext } from "./management-context";
import { readKeyJson } from "./read-json";
import { getKeySessionService } from "./service";

/** Self-service key management; session owner and workspace come exclusively from platform authority. */
export async function manageKeys(request: Request): Promise<Response> {
  try {
    if (request.method !== "GET") {
      // This route uses cookies even when a Bearer header is present. Do not let
      // that unrelated header exempt it from browser-origin validation.
      const origin = request.headers.get("origin");
      const site = request.headers.get("sec-fetch-site");
      if ((origin !== null && origin !== keySessionConfig().origin) || (site !== null && site !== "same-origin" && site !== "none")) return answer(403, { error: "key.cross_site" });
    }
    const binding = await keyManagementContext();
    if (!binding) return answer(401, { error: "key.unauthorized" });
    const service = await getKeySessionService();
    if (request.method === "GET") return answer(200, { keys: await service.listKeys(binding) });
    let payload: unknown;
    try { payload = await readKeyJson(request); }
    catch { return answer(400, { error: "key.invalid_request" }); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return answer(400, { error: "key.invalid_request" });
    const fields = payload as Record<string, unknown>;
    if (request.method === "POST" && Object.keys(fields).length === 1 && typeof fields.publicKey === "string") {
      return answer(201, { key: await service.enrollKey({ ...binding, publicKey: fields.publicKey }) });
    }
    if (request.method === "DELETE" && Object.keys(fields).length === 1 && typeof fields.keyId === "string") {
      const owned = (await service.listKeys(binding)).some((key) => key.keyId === fields.keyId);
      if (!owned) return answer(404, { error: "key.unknown" });
      await service.revokeKey(fields.keyId);
      return answer(200, { revoked: true });
    }
    return answer(400, { error: "key.invalid_request" });
  } catch (error) {
    return error instanceof KeySessionError ? answer(error.status, { error: error.code }) : answer(503, { error: "key.unavailable" });
  }
}

function answer(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
