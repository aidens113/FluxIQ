const IPV4_LOOPBACK_PATTERN = /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/u;

/**
 * True for a loopback host name as `URL.hostname` spells it: `localhost`, any
 * `127.0.0.0/8` address, or `[::1]` (brackets optional). Case-insensitive.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "[::1]" || host === "::1" || IPV4_LOOPBACK_PATTERN.test(host);
}
