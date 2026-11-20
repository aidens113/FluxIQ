import type { IdentityAccessService } from "../service.ts";

/**
 * Where people sign in, when it is not this store: the identity directory a
 * host hands this instance (`actOn`). A hosted tenant workspace has its own
 * Identity Access store, but its people sign in only through the platform
 * directory, which validates every panel session; so a person's own sign-in
 * security (their authenticator, their preferences, the capitals of their
 * sign-in name, their own sessions) is read and changed there, and only for
 * that person, never anyone else. With no directory set (a local or
 * self-hosted install, one workspace), this store is the directory and
 * nothing changes.
 *
 * Set once for the service's life: the same directory again is a no-op, and
 * a different one is refused, so nothing can quietly move a person's sign-in
 * to another store.
 */
export class IdentityDirectoryDelegation {
  private directory: (() => Promise<IdentityAccessService>) | null = null;

  /** Makes `directory` the store this instance's people sign in through. */
  actOn(directory: () => Promise<IdentityAccessService>): void {
    if (this.directory === directory) return;
    if (this.directory !== null) throw new Error("identity.directory_set: this instance's identity directory is already set");
    this.directory = directory;
  }

  /** The directory people sign in through, or null when it is this store. */
  async elsewhere(): Promise<IdentityAccessService | null> {
    return this.directory === null ? null : await this.directory();
  }
}
