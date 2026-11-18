import { createHash } from "node:crypto";
import type { EnvironmentEnrolmentDestination, EnvironmentEnrolmentRoute, EnvironmentEnrolmentTimer } from "./types.ts";

type Entry = { route: EnvironmentEnrolmentRoute; expiresAt: number; cancel(): void };

const unrefTimer: EnvironmentEnrolmentTimer = (run, delayMs) => {
  const timer = setTimeout(run, Math.max(0, delayMs));
  timer.unref();
  return () => clearTimeout(timer);
};

/**
 * Which tenant minted each live environment enrolment ticket, so the hosted
 * gateway can route a hello that carries one to that tenant and no other.
 * Only server code that minted a ticket in a tenant's own gateway registers
 * it; nothing a client sends can add a route, and a client never names its
 * workspace. A ticket the table does not know routes nowhere.
 *
 * Only a ticket's SHA-256 is kept. Looking a ticket up does not consume it:
 * the tenant's gateway consumes it on presentation, so a replay reaches the
 * same tenant and is refused there as used. An environment has at most one
 * routed ticket: registering another ends the one before, as minting another
 * revokes it in the gateway. A route ends, and its hold is released, when its
 * ticket expires or its environment's enrolment is revoked.
 */
export class EnvironmentEnrolmentRoutes {
  private readonly byDigest = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly schedule: EnvironmentEnrolmentTimer;

  constructor(options: { now?: () => number; schedule?: EnvironmentEnrolmentTimer } = {}) {
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? unrefTimer;
  }

  /** Routes `ticket` to its minting tenant until `expiresAt`. A route that cannot be registered is released at once. */
  register(ticket: string, route: EnvironmentEnrolmentRoute, expiresAt: number): void {
    if (typeof ticket !== "string" || !ticket || !exact(route.workspaceId) || !exact(route.environmentId) || !Number.isFinite(expiresAt)) {
      route.release();
      throw new TypeError("Invalid environment enrolment route");
    }
    this.endForEnvironment(route.environmentId);
    const digest = ticketDigest(ticket);
    this.end(digest);
    const entry: Entry = { route, expiresAt, cancel: () => undefined };
    this.byDigest.set(digest, entry);
    entry.cancel = this.schedule(() => {
      if (this.byDigest.get(digest) === entry) this.end(digest);
    }, expiresAt - this.now());
  }

  /** Where `ticket` routes, or null for a ticket this table never routed or whose route ended. */
  lookup(ticket: unknown): EnvironmentEnrolmentDestination | null {
    if (typeof ticket !== "string" || !ticket) return null;
    const digest = ticketDigest(ticket);
    const entry = this.byDigest.get(digest);
    if (entry === undefined) return null;
    if (entry.expiresAt <= this.now()) {
      this.end(digest);
      return null;
    }
    return { workspaceId: entry.route.workspaceId, environmentId: entry.route.environmentId };
  }

  /** Ends every route of the environment; answers how many ended. */
  endForEnvironment(environmentId: string): number {
    let ended = 0;
    for (const [digest, entry] of [...this.byDigest]) {
      if (entry.route.environmentId !== environmentId) continue;
      this.end(digest);
      ended += 1;
    }
    return ended;
  }

  /** How many routes are live; for tests of the table's bound. */
  size(): number {
    return this.byDigest.size;
  }

  private end(digest: string): void {
    const entry = this.byDigest.get(digest);
    if (entry === undefined) return;
    this.byDigest.delete(digest);
    entry.cancel();
    entry.route.release();
  }
}

function ticketDigest(ticket: string): string {
  return createHash("sha256").update(ticket, "utf8").digest("hex");
}

function exact(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
