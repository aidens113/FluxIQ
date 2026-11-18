/**
 * True when the browser addressed this computer by a loopback name
 * (`127.x.x.x`, `localhost`, `[::1]`), read from the `Host` it sent. A page
 * that rebinds its own DNS name to 127.0.0.1 is same-origin with itself and
 * passes an Origin check, but its `Host` is still its own name, so the
 * temporary credential is refused there. `request.url` is read only when no
 * `Host` came, since Next rewrites it. A `Host` that does not parse is refused.
 */
export function isLoopbackRequest(request: Request): boolean {
  // A Request's url is always absolute, so only the Host header can fail to parse.
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  return hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/u.test(hostname);
}
