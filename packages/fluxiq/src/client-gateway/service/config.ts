import { randomBytes } from "node:crypto";
import type { ClientGatewayServiceOptions, ClientGatewayTrustedClientStore } from "./types.ts";

/** `ClientGatewayServiceOptions` with every default already applied. */
export type ClientGatewayConfig = {
  readonly enabled: boolean;
  readonly publicUrl: string | undefined;
  readonly pairingTtlMs: number;
  readonly commandTimeoutMs: number;
  readonly trustedClientTtlMs: number;
  readonly trustedClientStore: ClientGatewayTrustedClientStore | undefined;
  readonly createToken: () => string;
  readonly now: () => number;
};

export function resolveClientGatewayConfig(options: ClientGatewayServiceOptions = {}): ClientGatewayConfig {
  return {
    enabled: options.enabled ?? true,
    publicUrl: options.publicUrl,
    pairingTtlMs: options.pairingTtlMs ?? 5 * 60_000,
    commandTimeoutMs: options.commandTimeoutMs ?? 30_000,
    trustedClientTtlMs: options.trustedClientTtlMs ?? 30 * 24 * 60 * 60_000,
    trustedClientStore: options.trustedClientStore,
    createToken: options.createToken ?? (() => randomBytes(32).toString("base64url")),
    now: options.now ?? Date.now
  };
}
