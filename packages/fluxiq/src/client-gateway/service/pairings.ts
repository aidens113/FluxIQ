import { randomInt } from "node:crypto";
import type { ClientGatewayPairingChallenge } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayConfig } from "./config.ts";
import type { ClientGatewayChangeKind } from "./change-feed/index.ts";
import { ClientGatewayPairingCapacityError, resolveClientGatewayPairingLimits, type ClientGatewayPairingLimits } from "./security/index.ts";
import type { ClientGatewayTimer } from "./types.ts";

/** The client address a pending challenge was asked for from: its requesting session's, or null when unknown. */
export type ClientGatewayPairingAddressLookup = (sessionId: string) => string | null;

/**
 * What the registry says of its own changes, and the clock its expiry wait
 * runs on. Only the two changes no other collaborator records as they happen
 * are told here: a challenge created, and challenges lapsing (with which ones).
 */
export type ClientGatewayPairingRegistryHooks = {
  changed?: (kind: Extract<ClientGatewayChangeKind, "pairing.requested" | "pairing.expired">) => void;
  /**
   * Hears the waiting challenges that just lapsed, once their lapse is
   * signalled and they are gone from the registry, in the same turn: the
   * gateway gives a client still waiting on one a fresh code on its socket.
   */
  lapsed?: (challenges: readonly ClientGatewayPairingChallenge[]) => void;
  /** Starts the wait for the next waiting challenge to lapse. Unset: a `setTimeout` that never keeps the process alive. */
  startExpiryTimer?: (delayMs: number, fire: () => void) => ClientGatewayTimer;
};

/**
 * Owns the pending pairing challenges. Storage, expiry and the pending caps
 * only: approving a pairing is a flow across several collaborators and lives
 * in ClientGatewayPairingFlow.
 */
export class ClientGatewayPairingRegistry {
  private readonly pairings = new Map<string, ClientGatewayPairingChallenge>();
  // Challenges taken back because the session that asked went away, kept until
  // they would have expired so an approval of one can say why it is gone.
  private readonly withdrawn = new Map<string, { reason: string; expiresAt: number }>();
  private readonly config: ClientGatewayConfig;
  private readonly addressOf: ClientGatewayPairingAddressLookup;
  private readonly changed: ClientGatewayPairingRegistryHooks["changed"];
  private readonly lapsed: ClientGatewayPairingRegistryHooks["lapsed"];
  private readonly startExpiryTimer: NonNullable<ClientGatewayPairingRegistryHooks["startExpiryTimer"]>;
  private limits: ClientGatewayPairingLimits;
  // The wait for the earliest waiting challenge to lapse, and that challenge's expiry.
  private expiry: { at: number; timer: ClientGatewayTimer } | undefined;

  /**
   * `addressOf` reads a requesting session's client address, for the
   * per-address cap; omitted, none is known. `hooks` hears the registry's own
   * changes; omitted, nothing does.
   */
  constructor(config: ClientGatewayConfig, addressOf: ClientGatewayPairingAddressLookup = () => null, hooks: ClientGatewayPairingRegistryHooks = {}) {
    this.config = config;
    this.addressOf = addressOf;
    this.changed = hooks.changed;
    this.lapsed = hooks.lapsed;
    this.startExpiryTimer = hooks.startExpiryTimer ?? startUnrefTimer;
    this.limits = config.pairingLimits;
  }

  /** Replaces the pending caps; challenges already waiting are kept, only new ones are refused. */
  setLimits(limits: ClientGatewayPairingLimits): void {
    this.limits = resolveClientGatewayPairingLimits(limits);
  }

  getLimits(): ClientGatewayPairingLimits {
    return { ...this.limits };
  }

  /**
   * The refusal a new challenge asked for by `requestedBySessionId` would meet,
   * or nothing when it is within both caps. Counts only challenges still
   * waiting: unconsumed and unexpired.
   */
  capacityRefusal(requestedBySessionId?: string): ClientGatewayPairingCapacityError | undefined {
    this.pruneExpired();
    const waiting = [...this.pairings.values()].filter((pairing) => !pairing.consumedAt);
    if (waiting.length >= this.limits.total) return new ClientGatewayPairingCapacityError("total");
    if (this.limits.perAddress === null || requestedBySessionId === undefined) return undefined;
    const address = this.addressOf(requestedBySessionId);
    if (address === null) return undefined;
    const fromAddress = waiting.filter((pairing) => pairing.requestedBySessionId !== undefined && this.addressOf(pairing.requestedBySessionId) === address);
    return fromAddress.length >= this.limits.perAddress ? new ClientGatewayPairingCapacityError("per_address") : undefined;
  }

  create(input: {
    projectId?: string | null;
    userId?: string;
    ttlMs?: number;
    requestedBySessionId?: string;
    requestedByClientId?: string;
    requestedByClientName?: string;
  }): ClientGatewayPairingChallenge {
    const pairingCode = this.nextCode();
    const pairing: ClientGatewayPairingChallenge = {
      pairingCode,
      referenceCode: pairingCode,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.requestedBySessionId !== undefined ? { requestedAt: this.config.now(), requestedBySessionId: input.requestedBySessionId } : {}),
      ...(input.requestedByClientId !== undefined ? { requestedByClientId: input.requestedByClientId } : {}),
      ...(input.requestedByClientName !== undefined ? { requestedByClientName: input.requestedByClientName } : {}),
      expiresAt: this.config.now() + (input.ttlMs ?? this.config.pairingTtlMs)
    };
    this.pairings.set(pairingCode, pairing);
    this.waitForExpiry();
    this.changed?.("pairing.requested");
    return pairing;
  }

  get(pairingCode: string): ClientGatewayPairingChallenge | undefined {
    return this.pairings.get(pairingCode);
  }

  delete(pairingCode: string): void {
    this.pairings.delete(pairingCode);
  }

  list(): ClientGatewayPairingChallenge[] {
    return [...this.pairings.values()];
  }

  size(): number {
    return this.pairings.size;
  }

  /**
   * Drops every waiting challenge past its expiry, says so once when any
   * lapsed, and hands the lapsed challenges to `hooks.lapsed`.
   */
  pruneExpired(): void {
    const now = this.config.now();
    const lapsed: ClientGatewayPairingChallenge[] = [];
    for (const [code, pairing] of this.pairings) {
      if (pairing.expiresAt >= now || pairing.consumedAt) continue;
      this.pairings.delete(code);
      lapsed.push(pairing);
    }
    for (const [code, withdrawal] of this.withdrawn) {
      if (withdrawal.expiresAt < now) this.withdrawn.delete(code);
    }
    if (lapsed.length === 0) return;
    this.changed?.("pairing.expired");
    this.lapsed?.(lapsed);
  }

  /**
   * Take back every unconsumed challenge a session asked for, so none is
   * offered for approval once nothing is waiting on it. Returns the codes.
   */
  withdrawForSession(sessionId: string, reason: string): string[] {
    const codes: string[] = [];
    for (const [code, pairing] of this.pairings) {
      if (pairing.requestedBySessionId !== sessionId || pairing.consumedAt) continue;
      this.pairings.delete(code);
      this.withdrawn.set(code, { reason, expiresAt: pairing.expiresAt });
      codes.push(code);
    }
    return codes;
  }

  /** Why a challenge was taken back, while it would still have been valid. */
  withdrawalReason(pairingCode: string): string | undefined {
    return this.withdrawn.get(pairingCode)?.reason;
  }

  /** Drop the other outstanding challenges of a session once one is consumed. */
  removeOthersForSession(sessionId: string, exceptPairingCode: string): void {
    for (const [code, pairing] of this.pairings) {
      if (code !== exceptPairingCode && pairing.requestedBySessionId === sessionId && !pairing.consumedAt) this.pairings.delete(code);
    }
  }

  /**
   * Waits for the earliest waiting challenge to lapse, so its lapse is told
   * when it happens rather than when something next reads the registry. One
   * wait at a time: it is moved when an earlier challenge arrives, and on
   * firing it prunes and waits for the next. A clock that has not moved since
   * the wait began (a test's stopped clock) cannot have reached the expiry,
   * so the wait is not started again until the registry is next written.
   */
  private waitForExpiry(fired?: { startedAt: number }): void {
    let next: number | undefined;
    for (const pairing of this.pairings.values()) {
      if (!pairing.consumedAt && (next === undefined || pairing.expiresAt < next)) next = pairing.expiresAt;
    }
    if (this.expiry !== undefined && this.expiry.at === next) return;
    this.expiry?.timer.cancel();
    this.expiry = undefined;
    const now = this.config.now();
    if (next === undefined || fired?.startedAt === now) return;
    const at = next;
    // pruneExpired drops a challenge once the clock is past its expiry, so the wait ends just after it.
    const timer = this.startExpiryTimer(Math.max(0, at - now) + 1, () => {
      if (this.expiry?.timer !== timer) return;
      this.expiry = undefined;
      this.pruneExpired();
      this.waitForExpiry({ startedAt: now });
    });
    this.expiry = { at, timer };
  }

  // Six digits from the operating system's cryptographic generator, never one
  // still waiting or recently withdrawn.
  private nextCode(): string {
    let code = "";
    do {
      code = String(randomInt(100000, 1000000));
    } while (this.pairings.has(code) || this.withdrawn.has(code));
    return code;
  }
}

/** A wait on the real clock that never keeps the process alive: a lapse no one is left to hear is not worth staying up for. */
function startUnrefTimer(delayMs: number, fire: () => void): ClientGatewayTimer {
  const handle = setTimeout(fire, delayMs);
  handle.unref?.();
  return { cancel: () => clearTimeout(handle) };
}
