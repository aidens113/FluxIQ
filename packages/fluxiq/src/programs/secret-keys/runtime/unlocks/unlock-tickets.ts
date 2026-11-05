import { randomBytes, timingSafeEqual } from "node:crypto";

/** How long a browser's ticket to start its own unlock stands. */
const UNLOCK_TICKET_MS = 30 * 60_000;

/**
 * What each browser nobody has unlocked yet can hand its person, to start its unlock from
 * itself. In memory: it just asks again. It names the holder it is for, so a page can show
 * which browser the person came from, and is no use without their password.
 */
export class SecretKeyUnlockTickets {
  private readonly tickets = new Map<string, { ticket: string; expiresAtMs: number }>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  /** This holder's live ticket, made if it has none. */
  for(holderId: string): string {
    const nowMs = this.now();
    const known = this.tickets.get(holderId);
    if (known && known.expiresAtMs > nowMs) return known.ticket;
    const ticket = `${holderId}.${randomBytes(24).toString("base64url")}`;
    this.tickets.set(holderId, { ticket, expiresAtMs: nowMs + UNLOCK_TICKET_MS });
    return ticket;
  }

  /** Whether this is the holder's live ticket, which it uses up. */
  redeem(holderId: string, ticket: string | undefined): boolean {
    const known = this.tickets.get(holderId);
    if (!known || ticket === undefined || known.expiresAtMs <= this.now()) return false;
    const expected = Buffer.from(known.ticket, "utf8");
    const given = Buffer.from(ticket, "utf8");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    this.tickets.delete(holderId);
    return true;
  }
}
