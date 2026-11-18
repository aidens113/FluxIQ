import type { Role, User } from "../../types.ts";

/**
 * Tells listeners when who may do what changed: a person added or removed, a
 * person's role or enabled flag, or a role's permissions. Everything else the
 * identity service keeps (credentials, sessions, the vault, a person's own
 * preferences) leaves every authorization as it was, so it is not announced.
 *
 * The service hands each state it is about to store to `observe`, which
 * compares only those fields with the last state it saw, so a login, which
 * also stores, costs a comparison and tells nobody. A holder of decisions made
 * from the directory (the client gateway's activity delivery, through the
 * paired project authority) reuses them until it is told.
 */
export class IdentityDirectoryChanges {
  private readonly listeners = new Set<() => void>();
  private seen: string | undefined;

  /** Adds a listener; the returned function removes it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Compares the directory with the last one seen and tells every listener
   * when it differs. The first one seen is announced too: nothing says what
   * a decision made before it read, and one decision too many is only asked
   * again.
   */
  observe(users: Iterable<User>, roles: Iterable<Role>): void {
    const next = directoryMark(users, roles);
    if (this.seen === next) return;
    this.seen = next;
    this.announce();
  }

  private announce(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("An identity directory listener failed.", error);
      }
    }
  }
}

/** The fields an authorization reads, in a stable order. */
function directoryMark(users: Iterable<User>, roles: Iterable<Role>): string {
  const people = [...users].map((user) => [user.id, user.roleId, user.enabled] as const).sort((left, right) => left[0].localeCompare(right[0]));
  const grants = [...roles].map((role) => [role.id, [...role.permissions].sort()] as const).sort((left, right) => left[0].localeCompare(right[0]));
  return JSON.stringify([people, grants]);
}
