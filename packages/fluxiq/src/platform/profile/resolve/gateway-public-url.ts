import type { FluxIQProfile } from "@fluxiq/contracts/platform";

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

/** The WebSocket URL clients are told to connect to. */
export function resolveGatewayPublicUrl(input: { profile: FluxIQProfile; override: string | undefined; host: string; port: number; path: string; publicOrigin: string }): string {
  const override = input.override?.trim();
  if (override) return override;
  if (input.profile === "local") {
    const host = input.host === "0.0.0.0" ? "127.0.0.1" : input.host;
    const bracketed = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    return `ws://${bracketed}:${input.port}${input.path}`;
  }
  const origin = new URL(input.publicOrigin);
  const insecure = origin.protocol === "http:" && isLoopbackHostname(origin.hostname);
  return `${insecure ? "ws" : "wss"}://${origin.host}${input.path}`;
}
