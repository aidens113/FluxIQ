import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IamRequestConsent } from "../../../platform/iam/index.ts";
import { pressGrantPayloadDigest } from "./payload/index.ts";
import type { PressGrantBinding, PressGrantMinted, PressGrantStoreOptions } from "./types.ts";

/** How long a press confirms its act: long enough for the page to send the call, too short to keep. */
const LIFETIME_MS = 60_000;
/** 256 bits from the OS's generator, sent as base64url (43 characters). */
const GRANT_BYTES = 32;
const GRANT_SHAPE = /^[A-Za-z0-9_-]{43}$/u;
/**
 * Grants one session may hold unused at once. Each press mints one and its
 * call spends it within a second, so a person never holds more than a few;
 * the bound keeps a signed-in script that mints in a loop from growing this
 * process's memory. Past it the session's oldest unused grant stops working,
 * and its call is answered "Press Allow again".
 */
const UNUSED_PER_SESSION = 16;

type Held = { binding: Buffer; session: string; expiresAt: number; consent: IamRequestConsent };

/**
 * The press grants of one registry, in memory: a grant is a secret the
 * person's own press obtains, and it confirms exactly one destructive call.
 *
 * - Only a SHA-256 of each grant is kept, as the map key; the grant itself is
 *   returned once by `mint` and never stored, logged or echoed.
 * - `consume` is synchronous: the grant is looked up and deleted before
 *   anything about it is checked, with no await in between, so two calls
 *   racing with one grant cannot both pass, and a grant presented with the
 *   wrong session, person, endpoint or payload, or too late, is spent anyway.
 * - The binding (session digest, person, program, endpoint, payload digest) is
 *   compared as a fixed-length digest with `timingSafeEqual`.
 * - A restart forgets every grant, which only makes the person press again.
 */
export class PressGrantStore {
  private readonly held = new Map<string, Held>();
  private readonly now: () => number;

  constructor(options: PressGrantStoreOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  /** Mints a grant for exactly `binding`, usable once until `expiresAt`, earned as `consent` says. */
  mint(binding: PressGrantBinding, consent: IamRequestConsent): PressGrantMinted {
    const now = this.now();
    this.forgetExpired(now);
    const session = sha256Hex(binding.sessionId);
    this.makeRoom(session);
    const grant = randomBytes(GRANT_BYTES).toString("base64url");
    const expiresAt = now + LIFETIME_MS;
    this.held.set(sha256Hex(grant), { binding: bindingDigest(binding), session, expiresAt, consent });
    return { grant, expiresAt };
  }

  /**
   * Spends `grant` and says whether it confirms `binding`: it was minted
   * here, has not been presented before, has not expired, and was minted for
   * this same session, person, endpoint and payload. Anything that is not a
   * well-formed grant is refused without being looked up.
   */
  consume(grant: unknown, binding: PressGrantBinding): boolean {
    if (typeof grant !== "string" || !GRANT_SHAPE.test(grant)) return false;
    const key = sha256Hex(grant);
    const held = this.held.get(key);
    if (held === undefined) return false;
    this.held.delete(key);
    const now = this.now();
    this.forgetExpired(now);
    if (now >= held.expiresAt) return false;
    return timingSafeEqual(held.binding, bindingDigest(binding));
  }

  /**
   * How `grant` was earned, when it would confirm `binding` now (as `consume`
   * decides it, without spending it), else undefined. `call()` reads it
   * before its decision so the call's audit row can say how the person
   * consented; `consume` still decides the call afterwards.
   */
  consentOf(grant: unknown, binding: PressGrantBinding): IamRequestConsent | undefined {
    if (typeof grant !== "string" || !GRANT_SHAPE.test(grant)) return undefined;
    const held = this.held.get(sha256Hex(grant));
    if (held === undefined || this.now() >= held.expiresAt) return undefined;
    return timingSafeEqual(held.binding, bindingDigest(binding)) ? held.consent : undefined;
  }

  private forgetExpired(now: number): void {
    for (const [key, held] of this.held) if (now >= held.expiresAt) this.held.delete(key);
  }

  private makeRoom(session: string): void {
    const own = [...this.held].filter(([, held]) => held.session === session);
    for (const [key] of own.slice(0, Math.max(0, own.length - UNUSED_PER_SESSION + 1))) this.held.delete(key);
  }
}

function bindingDigest(binding: PressGrantBinding): Buffer {
  const parts = [sha256Hex(binding.sessionId), binding.actorId, normalized(binding.programId), normalized(binding.endpoint), pressGrantPayloadDigest(binding.payload)];
  return createHash("sha256").update(JSON.stringify(parts)).digest();
}

/** Programs and endpoints are named as the registry looks them up: trimmed and lower-cased. */
function normalized(name: string): string {
  return name.trim().toLowerCase();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
