import { NextResponse } from "next/server";
import { readBearerToken } from "../../../../lib/program-route";
import { getFluxIQ } from "../../../../lib/fluxiq";

// A browser that forgot its pairing while offline delivers it when it can. The credential
// is the whole of the proof: it needs no socket, and it can only end its own trust.
export async function POST(request: Request) {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const gateway = getFluxIQ().programs.clientGateway;
  await gateway.ready();
  const forgotten = await gateway.access.forgetByCredential(token);
  // A credential that speaks for nothing has nothing left to forget, so the browser may stop asking.
  return NextResponse.json({ ok: true, payload: { forgotten } });
}
