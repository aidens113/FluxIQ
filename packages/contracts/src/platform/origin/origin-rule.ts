/**
 * One entry of the client gateway's Origin allowlist, parsed. Exact entries
 * match one serialised Origin; the one prefix entry, `moz-extension://*`,
 * admits every Firefox extension origin, because Firefox gives each install
 * its own id.
 */
export type ClientGatewayOriginRule = { kind: "exact"; origin: string } | { kind: "prefix"; prefix: string };

/** The one wildcard entry the grammar takes. */
export const CLIENT_GATEWAY_ANY_FIREFOX_EXTENSION_ENTRY = "moz-extension://*";

/** The scheme prefix `moz-extension://*` admits. */
export const CLIENT_GATEWAY_FIREFOX_EXTENSION_PREFIX = "moz-extension://";

const CHROMIUM_EXTENSION_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/u;
const FIREFOX_EXTENSION_PATTERN = /^moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const WEB_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:"]);

/**
 * Parses one allowlist entry, or returns null for an entry the grammar
 * refuses. Accepted:
 *
 * - an exact web origin in canonical form (`https://app.getfluxiq.com`,
 *   `http://127.0.0.1:3000`);
 * - `chrome-extension://<32 letters a-p>` (Chrome and Edge ids differ, so each
 *   is listed);
 * - `moz-extension://<uuid>` exactly, or `moz-extension://*` by prefix.
 *
 * Refused: `*`, `null`, any other wildcard (`https://*.example.com`,
 * `chrome-extension://*`), a path, query or trailing slash, user info, a
 * non-canonical spelling, and any other scheme.
 */
export function parseClientGatewayOriginRule(entry: string): ClientGatewayOriginRule | null {
  if (entry === CLIENT_GATEWAY_ANY_FIREFOX_EXTENSION_ENTRY) return { kind: "prefix", prefix: CLIENT_GATEWAY_FIREFOX_EXTENSION_PREFIX };
  if (CHROMIUM_EXTENSION_PATTERN.test(entry) || FIREFOX_EXTENSION_PATTERN.test(entry)) return { kind: "exact", origin: entry };
  // URL parsing takes `*` as a host character, so a wildcard is refused before it.
  if (/[*?]/u.test(entry) || !URL.canParse(entry)) return null;
  const url = new URL(entry);
  if (!WEB_SCHEMES.has(url.protocol) || url.origin !== entry) return null;
  return { kind: "exact", origin: entry };
}

/** Parses a whole allowlist: the rules it holds, and every entry refused, verbatim. */
export function parseClientGatewayOriginAllowlist(entries: readonly string[]): { rules: ClientGatewayOriginRule[]; refused: string[] } {
  const rules: ClientGatewayOriginRule[] = [];
  const refused: string[] = [];
  for (const entry of entries) {
    const rule = parseClientGatewayOriginRule(entry);
    if (rule === null) refused.push(entry);
    else rules.push(rule);
  }
  return { rules, refused };
}
