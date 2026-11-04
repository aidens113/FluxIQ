// The stores a database-manager caller may not reach without proving themselves again.
// One list, because two copies of a list like this is how a third store slips through.

const SENSITIVE_DATABASE_KINDS: ReadonlySet<string> = new Set(["identity.users", "secret.keys", "secret.credential-unlocks"]);

/** Written only by the program that owns them: a row here decides who is handed a person's key, so nobody edits one by hand, recheck or not. */
const OWNER_WRITTEN_DATABASE_KINDS: ReadonlySet<string> = new Set(["secret.credential-unlocks"]);

export function isSensitiveDatabaseKind(kind: string): boolean {
  return SENSITIVE_DATABASE_KINDS.has(kind.trim().toLowerCase());
}

export function isOwnerWrittenDatabaseKind(kind: string): boolean {
  return OWNER_WRITTEN_DATABASE_KINDS.has(kind.trim().toLowerCase());
}
