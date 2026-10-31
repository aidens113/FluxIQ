/**
 * Where a caller's panel session is read from: a route's `Request` (or
 * `NextRequest`), or, for a server component with no request, the awaited
 * `headers()` and `cookies()` of `next/headers`.
 */
export type WorkspaceRequestSource =
  | Request
  | {
    headers?: { get(name: string): string | null } | undefined;
    cookies?: { get(name: string): { value: string } | undefined } | undefined;
  };

/**
 * The panel session id a request carries in the cookie `cookieName`, or null.
 * Read from the source's parsed cookies when it has them (`NextRequest`,
 * `cookies()`), else from its `cookie` header.
 */
export function sessionIdOf(source: WorkspaceRequestSource, cookieName: string): string | null {
  const cookies = (source as { cookies?: { get?: unknown } }).cookies;
  if (cookies && typeof cookies.get === "function") {
    const value = (cookies as { get(name: string): { value: string } | undefined }).get(cookieName)?.value;
    return value ? value : null;
  }
  const header = source.headers?.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName) continue;
    const value = part.slice(separator + 1).trim();
    return value ? value : null;
  }
  return null;
}
