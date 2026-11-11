import { createHash, randomBytes } from "node:crypto";
import { CLIENT_GATEWAY_ENROLMENT_REFUSALS } from "./enrolment-refusal.ts";
import type { ClientGatewayHostEnrolmentBinding, ClientGatewayHostEnrolmentRedemption, ClientGatewayHostEnrolmentRequest, ClientGatewayHostEnrolmentTicket } from "./types.ts";

/** How long a ticket lives unless its request says otherwise: long enough for a launched host's first hello. */
const DEFAULT_TICKET_TTL_MS = 60_000;

/** Marks a ticket as FluxIQ's, so a leaked one is recognisable; the body is 32 random bytes. */
const TICKET_PREFIX = "fxet_";
const TICKET_BYTES = 32;

/** A ticket as it is kept: its binding and life, never the ticket itself. */
type TicketRecord = ClientGatewayHostEnrolmentBinding & {
  ttlMs: number;
  expiresAt: number;
  /** `live` until presented (`used`) or replaced by a newer ticket for its host (`revoked`). */
  state: "live" | "used" | "revoked";
};

/**
 * The one-time tickets that enrol a managed host without a person's approval.
 * Only code in the engine's process can mint one: nothing routes to `issue`.
 *
 * Only a ticket's SHA-256 is kept, so nothing here can leak one. A ticket is
 * consumed the first time it is presented, whatever that presentation comes to,
 * so a replay is always refused. Each host has at most one live ticket: minting
 * another revokes the one before. A ticket that ended (used, revoked or expired)
 * is remembered for as long again as it lived, so presenting it says why it was
 * refused, and then forgotten, so the table holds only recent tickets.
 */
export class ClientGatewayHostEnrolmentTickets {
  private readonly byDigest = new Map<string, TicketRecord>();
  private readonly liveDigestByHost = new Map<string, string>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  issue(request: ClientGatewayHostEnrolmentRequest): ClientGatewayHostEnrolmentTicket {
    const binding = validBinding(request);
    const ttlMs = request.ttlMs ?? DEFAULT_TICKET_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("client_gateway.enrolment_ttl_invalid: ttlMs must be a positive number of milliseconds.");
    this.forgetEnded();
    this.revokeForHost(binding.hostId);
    const ticket = `${TICKET_PREFIX}${randomBytes(TICKET_BYTES).toString("base64url")}`;
    const digest = ticketDigest(ticket);
    const expiresAt = this.now() + ttlMs;
    this.byDigest.set(digest, { ...binding, ttlMs, expiresAt, state: "live" });
    this.liveDigestByHost.set(binding.hostId, digest);
    return { ticket, expiresAt };
  }

  /**
   * What presenting `ticket` from a client declaring `declaredDomainId` comes
   * to. A known ticket is consumed here, before anything about it is judged.
   */
  redeem(ticket: unknown, declaredDomainId: string | null): ClientGatewayHostEnrolmentRedemption {
    this.forgetEnded();
    const digest = typeof ticket === "string" && ticket ? ticketDigest(ticket) : undefined;
    const record = digest === undefined ? undefined : this.byDigest.get(digest);
    if (digest === undefined || !record) return { kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.unknown.code };
    const { hostId } = record;
    if (record.state === "used") return { kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.used.code, hostId };
    const expired = record.expiresAt <= this.now();
    const revoked = record.state === "revoked";
    record.state = "used";
    this.endLive(record, digest);
    if (expired) return { kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.expired.code, hostId };
    if (revoked) return { kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.revoked.code, hostId };
    if (record.domainId !== declaredDomainId) return { kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.domainMismatch.code, hostId };
    return { kind: "redeemed", binding: { hostId, domainId: record.domainId, profile: record.profile } };
  }

  /** Revokes the host's live ticket, if it has one; true when one was revoked. */
  revokeForHost(hostId: string): boolean {
    const digest = this.liveDigestByHost.get(hostId);
    if (digest === undefined) return false;
    this.liveDigestByHost.delete(hostId);
    const record = this.byDigest.get(digest);
    if (!record || record.state !== "live") return false;
    record.state = "revoked";
    return true;
  }

  /** How many tickets are remembered, live or ended; for tests of the table's bound. */
  size(): number {
    return this.byDigest.size;
  }

  private endLive(record: TicketRecord, digest: string): void {
    if (this.liveDigestByHost.get(record.hostId) === digest) this.liveDigestByHost.delete(record.hostId);
  }

  private forgetEnded(): void {
    const now = this.now();
    for (const [digest, record] of this.byDigest) {
      if (record.expiresAt + record.ttlMs > now) continue;
      this.byDigest.delete(digest);
      this.endLive(record, digest);
    }
  }
}

function ticketDigest(ticket: string): string {
  return createHash("sha256").update(ticket, "utf8").digest("hex");
}

function validBinding(request: ClientGatewayHostEnrolmentRequest): ClientGatewayHostEnrolmentBinding {
  const hostId = typeof request.hostId === "string" ? request.hostId.trim() : "";
  const domainId = typeof request.domainId === "string" ? request.domainId.trim() : "";
  if (!hostId) throw new Error("client_gateway.enrolment_host_required: an enrolment ticket names the host it enrols.");
  if (!domainId) throw new Error("client_gateway.enrolment_domain_required: an enrolment ticket names the domain its host must declare.");
  if (request.profile !== "fresh" && request.profile !== "named") throw new Error("client_gateway.enrolment_profile_invalid: profile is \"fresh\" or \"named\".");
  return { hostId, domainId, profile: request.profile };
}
