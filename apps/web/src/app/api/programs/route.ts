import { NextResponse, type NextRequest } from "next/server";
import { programDirectorySchema } from "fluxiq";
import { getFluxIQ } from "../../../lib/fluxiq";

export function GET(request: NextRequest) {
  const domainId = request.nextUrl.searchParams.get("domain");
  const directory = getFluxIQ().programDirectory(domainId);
  return NextResponse.json(programDirectorySchema.parse(directory));
}
