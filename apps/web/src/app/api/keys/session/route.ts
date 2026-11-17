import { KeySessionError } from "fluxiq/platform";
import { getKeySessionService, readKeyJson } from "../../../../server/key-sessions";

export const runtime = "nodejs";

/** Signed SDK proof exchange. No cookie, payload user id or supplied public key enrolls a caller. */
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("fluxiq-client") !== "sdk") return failure(400, "key.bad_proof", "A signed SDK proof is required.");
  let proof: unknown;
  try { proof = await readKeyJson(request); }
  catch { return failure(400, "key.bad_proof", "Invalid key-session request."); }
  try {
    const service = await getKeySessionService();
    return Response.json(await service.exchange(proof), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof KeySessionError) return failure(error.status, error.code, error.message, error.serverTime);
    return failure(503, "key.unavailable", "Key sessions are unavailable.");
  }
}

function failure(status: number, code: string, message: string, serverTime?: number): Response {
  return Response.json({ error: { code, message, ...(serverTime === undefined ? {} : { serverTime }) } }, { status, headers: { "cache-control": "no-store" } });
}
