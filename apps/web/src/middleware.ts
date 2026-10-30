import { NextResponse, type NextRequest } from "next/server";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { FLUXIQ_CONNECT_PATHS, isCrossSiteRequest, isOperatorOnlyPath } from "./lib/request-guard";

function refuse(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/** Discovery rewrite, operator-only endpoints on public profiles, and the cross-site guard for cookie-carrying writes. */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname === FLUXIQ_CONNECT_PATHS.discovery) {
    return NextResponse.rewrite(new URL(FLUXIQ_CONNECT_PATHS.discoveryRoute, request.url));
  }
  let settings;
  try {
    settings = resolveFluxIQDeploymentSettings(process.env);
  } catch {
    return refuse("deployment_misconfigured", 500);
  }
  if (settings.public && isOperatorOnlyPath(pathname)) return refuse("operator_only", 403);
  const crossSite = isCrossSiteRequest({
    method: request.method,
    headers: request.headers,
    hasSessionCookie: request.cookies.has(settings.session.name),
    allowedOrigin: settings.public ? settings.publicOrigin : null
  });
  return crossSite ? refuse("cross_site_request", 403) : NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
