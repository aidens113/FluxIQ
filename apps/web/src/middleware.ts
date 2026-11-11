import { NextResponse, type NextRequest } from "next/server";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { FLUXIQ_CONNECT_PATHS, isCrossSiteRequest, isOperatorOnlyPath } from "./lib/request-guard";
import { currentPanelPreset, isHiddenPanelPath } from "./app/product/preset";

function refuse(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * A path no route serves: a screen the deployment's preset hides is rewritten
 * here, so Next answers it with its not-found page and a real 404 before any
 * rendering starts.
 */
const HIDDEN_SCREEN_PATH = "/__fluxiq-hidden-by-panel-preset";

/** Discovery rewrite, operator-only endpoints on public profiles, screens the panel preset hides, and the cross-site guard for cookie-carrying writes. */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname === FLUXIQ_CONNECT_PATHS.discovery) {
    return NextResponse.rewrite(new URL(FLUXIQ_CONNECT_PATHS.discoveryRoute, request.url));
  }
  let settings;
  let preset;
  try {
    settings = resolveFluxIQDeploymentSettings(process.env);
    preset = currentPanelPreset();
  } catch {
    return refuse("deployment_misconfigured", 500);
  }
  if (settings.public && isOperatorOnlyPath(pathname)) return refuse("operator_only", 403);
  if (isHiddenPanelPath(pathname, preset)) return NextResponse.rewrite(new URL(HIDDEN_SCREEN_PATH, request.url));
  const crossSite = isCrossSiteRequest({
    method: request.method,
    headers: request.headers,
    hasSessionCookie: request.cookies.has(settings.session.name),
    allowedOrigin: settings.public ? settings.publicOrigin : null
  });
  return crossSite ? refuse("cross_site_request", 403) : NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
