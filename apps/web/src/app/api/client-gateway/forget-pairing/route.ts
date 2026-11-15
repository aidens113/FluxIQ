import { NextResponse } from "next/server";
import { readBearerToken } from "../../../../lib/program-route";
import { forgetClientCredential } from "../../../../server/browser-trust/teardown";

// A browser that forgot its pairing while offline delivers it when it can. The credential
// is the whole of the proof: it needs no socket, and it can only end its own trust.
export async function POST(request: Request) {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  try {
    const forgotten = await forgetClientCredential(token);
    // A credential that speaks for nothing has nothing left to forget, so the browser may stop asking.
    return NextResponse.json({ ok: true, payload: { forgotten } });
  } catch {
    return NextResponse.json({ ok: false, error: "Client trust could not be removed. Please try again." }, { status: 503 });
  }
}
