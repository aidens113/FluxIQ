import { isSameOriginPath } from "../url/index.ts";

/**
 * The fixed same-origin paths of discovery and connect. Discovery publishes
 * the connect ones (`FluxIQDiscoveryDocument.connect`), so a client reads them
 * from there rather than from this table; the table is what Core serves.
 */
export const FLUXIQ_CONNECT_PATHS = Object.freeze({
  discovery: "/.well-known/fluxiq",
  discoveryRoute: "/api/discovery",
  authorize: "/connect/authorize",
  done: "/connect/done",
  codeEntry: "/connect",
  token: "/api/connect/token",
  revoke: "/api/connect/revoke",
  welcome: "/welcome"
} as const);

/**
 * True for a `continueUrl` the welcome link may honour: a same-origin path to
 * the authorize page, with or without its query, so a sign-up started from a
 * client returns to consent. Anything else is ignored, never followed.
 */
export function isConnectContinuePath(value: unknown): value is string {
  if (!isSameOriginPath(value)) return false;
  const path = value.split(/[?#]/u, 1)[0];
  return path === FLUXIQ_CONNECT_PATHS.authorize && !value.includes("#");
}
