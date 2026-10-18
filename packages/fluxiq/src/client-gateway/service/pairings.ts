import type { ClientGatewayPairingChallenge } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayConfig } from "./config.ts";

/**
 * Owns the pending pairing challenges. Storage and expiry only: approving a
 * pairing is a flow across several collaborators and lives in
 * ClientGatewayPairingFlow.
 */
export class ClientGatewayPairingRegistry {
  private readonly pairings = new Map<string, ClientGatewayPairingChallenge>();
  // Challenges taken back because the session that asked went away, kept until
  // they would have expired so an approval of one can say why it is gone.
  private readonly withdrawn = new Map<string, { reason: string; expiresAt: number }>();
  private readonly config: ClientGatewayConfig;

  constructor(config: ClientGatewayConfig) {
    this.config = config;
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

  pruneExpired(): void {
    const now = this.config.now();
    for (const [code, pairing] of this.pairings) {
      if (pairing.expiresAt < now && !pairing.consumedAt) this.pairings.delete(code);
    }
    for (const [code, withdrawal] of this.withdrawn) {
      if (withdrawal.expiresAt < now) this.withdrawn.delete(code);
    }
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

  private nextCode(): string {
    let code = "";
    do {
      code = String(Math.floor(100000 + Math.random() * 900000));
    } while (this.pairings.has(code) || this.withdrawn.has(code));
    return code;
  }
}
