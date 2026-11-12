import { humannessSchema } from "@fluxiq/contracts/automation";
import type { User } from "../../types.ts";

/** What the preferences read and write: the service's held users, its single-flight load and its persist. */
export type IdentityPersonalPreferencesPorts = {
  users: Map<string, User>;
  ready: () => Promise<void>;
  persist: () => Promise<void>;
};

/**
 * A person's own preferences, kept on their `User` record and stored with it.
 * Every method takes the person it acts for, which a caller must take from
 * who is signed in (a session's own user, a run's caller), never from an id a
 * request body named: nothing here can tell one person from another.
 */
export class IdentityPersonalPreferences {
  constructor(private readonly ports: IdentityPersonalPreferencesPorts) {}

  /** The person's stored starting humanness, or null when they set none or the account is unknown. */
  async startingHumanness(userId: string): Promise<number | null> {
    await this.ports.ready();
    return this.ports.users.get(userId)?.startingHumanness ?? null;
  }

  /**
   * Sets (or, with null, clears) the person's starting humanness: an integer
   * 0-100 (`humannessSchema`). Refuses any other value and an unknown or
   * disabled account. Returns the value now stored. The account's `updatedAtMs`
   * is left as it was: others see that field (the snapshot), and it must not
   * tell them when a person changed a preference of their own.
   */
  async setStartingHumanness(userId: string, value: number | null): Promise<number | null> {
    await this.ports.ready();
    if (value !== null && !humannessSchema.safeParse(value).success) throw new Error("A starting humanness is a whole number from 0 to 100, or null to clear it.");
    const user = this.ports.users.get(userId);
    if (!user || !user.enabled) throw new Error(`Unknown or disabled user: ${userId}`);
    const { startingHumanness: _previous, ...rest } = user;
    this.ports.users.set(userId, { ...rest, ...(value === null ? {} : { startingHumanness: value }) });
    await this.ports.persist();
    return value;
  }
}
