import { NextResponse, type NextRequest } from "next/server";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { FLUXIQ_CONNECT_PATHS, isClosedPlansPath, isClosedSignupPath, isCrossSiteRequest, isOperatorOnlyPath } from "./lib/request-guard";
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

/** Connection pages expose no authorization evidence to caches, referrers, framing or third-party resources. */
function connectHeaders(pathname: string, response: NextResponse): NextResponse {
  if (pathname === "/connect" || pathname.startsWith("/connect/") || pathname.startsWith("/api/connect/")) {
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.set("x-frame-options", "DENY");
    response.headers.set("x-content-type-options", "nosniff");
    response.headers.set("content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  }
  return response;
}

/** Discovery rewrite, operator-only endpoints on public profiles, screens the panel preset hides (and the sign-up page while sign-up is closed, the plan page while billing is off), and the cross-site guard for cookie-carrying writes. */
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
    return connectHeaders(pathname, refuse("deployment_misconfigured", 500));
  }
  if (settings.public && isOperatorOnlyPath(pathname)) return connectHeaders(pathname, refuse("operator_only", 403));
  if (isHiddenPanelPath(pathname, preset) || isClosedSignupPath(pathname, settings.signup) || isClosedPlansPath(pathname, process.env.FLUXIQ_COMMERCE_CONFIG_FILE)) return connectHeaders(pathname, NextResponse.rewrite(new URL(HIDDEN_SCREEN_PATH, request.url)));
  const crossSite = isCrossSiteRequest({
    method: request.method,
    headers: request.headers,
    hasSessionCookie: request.cookies.has(settings.session.name),
    allowedOrigin: settings.public ? settings.publicOrigin : null
  });
  return connectHeaders(pathname, crossSite ? refuse("cross_site_request", 403) : NextResponse.next());
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
