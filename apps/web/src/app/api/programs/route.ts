import { NextResponse, type NextRequest } from "next/server";
import { programDirectorySchema } from "fluxiq";
import { requireFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";

export async function GET(request: NextRequest) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const domainId = request.nextUrl.searchParams.get("domain");
  const directory = getFluxIQ().programDirectory(domainId);
  return NextResponse.json(programDirectorySchema.parse(directory));
}
