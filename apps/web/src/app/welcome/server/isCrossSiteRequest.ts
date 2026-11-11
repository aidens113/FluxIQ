import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { isCrossSiteRequest as isCrossSiteWrite } from "../../../lib/request-guard";

/**
 * True when the browser says this pre-sign-in post (welcome, setup) came from
 * another site. It applies the panel's one cross-site rule
 * (`lib/request-guard`, which the middleware applies to cookie-carrying
 * writes) as if a session were present, since these posts mint one: on a
 * public profile the `Origin` must be the deployment's public origin; on a
 * local install its host must equal the `Host` the browser addressed. It never
 * compares with `request.url`, which Next rewrites (a page opened at
 * 127.0.0.1 posts with that Origin while `request.url` says localhost).
 */
export function isCrossSiteRequest(request: Request): boolean {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  return isCrossSiteWrite({
    method: request.method,
    headers: request.headers,
    hasSessionCookie: true,
    allowedOrigin: settings.public ? settings.publicOrigin : null
  });
}
