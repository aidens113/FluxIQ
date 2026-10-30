import { randomBytes, randomUUID } from "node:crypto";
import { CLIENT_GATEWAY_DEFAULT_AUDIT_LIMIT } from "./audit-log.ts";
import { resolveClientGatewayPairingLimits, type ClientGatewayPairingLimits } from "./security/index.ts";
import { CLIENT_GATEWAY_DEFAULT_SESSION_RETENTION, type ClientGatewaySessionRetention } from "./sessions.ts";
import type { ClientGatewayIdKind, ClientGatewayServiceOptions, ClientGatewayTimer, ClientGatewayTimedWait, ClientGatewayTimerSource, ClientGatewayTrustedClientStore } from "./types.ts";

/** `ClientGatewayServiceOptions` with every default already applied. */
export type ClientGatewayConfig = {
  readonly enabled: boolean;
  readonly publicUrl: string | undefined;
  readonly pairingTtlMs: number;
  readonly commandTimeoutMs: number;
  readonly reconcileAnswerMs: number;
  readonly trustedClientTtlMs: number;
  /** The caps a new gateway starts with; `setPairingLimits` replaces them on the pairing registry. */
  readonly pairingLimits: ClientGatewayPairingLimits;
  readonly sessionRetention: ClientGatewaySessionRetention;
  readonly auditLimit: number;
  readonly trustedClientStore: ClientGatewayTrustedClientStore | undefined;
  readonly createToken: () => string;
  readonly now: () => number;
  readonly createId: (kind: ClientGatewayIdKind) => string;
  readonly startTimer: ClientGatewayTimerSource;
};

export function resolveClientGatewayConfig(options: ClientGatewayServiceOptions = {}): ClientGatewayConfig {
  return {
    enabled: options.enabled ?? true,
    publicUrl: options.publicUrl,
    pairingTtlMs: options.pairingTtlMs ?? 5 * 60_000,
    commandTimeoutMs: options.commandTimeoutMs ?? 30_000,
    reconcileAnswerMs: options.reconcileAnswerMs ?? 5_000,
    trustedClientTtlMs: options.trustedClientTtlMs ?? 30 * 24 * 60 * 60_000,
    pairingLimits: resolveClientGatewayPairingLimits(options.pairingLimits),
    sessionRetention: {
      limit: options.endedSessionLimit ?? CLIENT_GATEWAY_DEFAULT_SESSION_RETENTION.limit,
      maxAgeMs: options.endedSessionMaxAgeMs === undefined ? CLIENT_GATEWAY_DEFAULT_SESSION_RETENTION.maxAgeMs : options.endedSessionMaxAgeMs
    },
    auditLimit: options.auditLimit ?? CLIENT_GATEWAY_DEFAULT_AUDIT_LIMIT,
    trustedClientStore: options.trustedClientStore,
    createToken: options.createToken ?? (() => randomBytes(32).toString("base64url")),
    now: options.now ?? Date.now,
    createId: options.createId ?? (() => randomUUID()),
    startTimer: options.startTimer ?? startRealTimer
  };
}

/** A wait on the real clock. */
function startRealTimer(_wait: ClientGatewayTimedWait, delayMs: number, fire: () => void): ClientGatewayTimer {
  const handle = setTimeout(fire, delayMs);
  return { cancel: () => clearTimeout(handle) };
}
