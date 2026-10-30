import { NextResponse } from "next/server";
import { FLUXIQ_DISCOVERY_MAX_AGE_SECONDS } from "../../../lib/request-guard";
import { buildDiscoveryDocument } from "./build-discovery-document";

export const dynamic = "force-dynamic";

/** `GET /.well-known/fluxiq` (rewritten here by the middleware): what a client needs to connect. No secrets. */
export function GET(): NextResponse {
  const built = buildDiscoveryDocument(process.env);
  if (!built.ok) return NextResponse.json({ ok: false, code: "discovery_misconfigured", fields: built.fields }, { status: 500, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(built.document, { headers: { "Cache-Control": `public, max-age=${FLUXIQ_DISCOVERY_MAX_AGE_SECONDS}` } });
}
