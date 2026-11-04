// The stores a database-manager caller may not reach without proving themselves again,
// and the rows nobody writes by hand at all. One place, because two copies of a list
// like this is how a third store slips through.

const SENSITIVE_DATABASE_KINDS: ReadonlySet<string> = new Set(["identity.users", "secret.keys", "secret.credential-unlocks"]);

/** Written only by the program that owns it: a row here decides who is handed a person's key, so nobody edits one by hand, recheck or not. */
const OWNER_WRITTEN_DATABASE_KINDS: ReadonlySet<string> = new Set(["secret.credential-unlocks"]);

/** In Identity Access's store, what proves who a person is. It reads a row by what it says it is, so the row's id and its content are both asked. */
const IDENTITY_PROOF_RECORD_TYPES: ReadonlySet<string> = new Set(["credential", "session"]);

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export function isSensitiveDatabaseKind(kind: string): boolean {
  return SENSITIVE_DATABASE_KINDS.has(normalized(kind));
}

export function isOwnerWrittenDatabaseKind(kind: string): boolean {
  return OWNER_WRITTEN_DATABASE_KINDS.has(normalized(kind));
}

/** Whether nobody may write or delete this row by hand, whatever they have proved. `data` is what a put would store. */
export function isOwnerWrittenDatabaseRecord(kind: string, id: string, data?: unknown): boolean {
  if (isOwnerWrittenDatabaseKind(kind)) return true;
  if (normalized(kind) !== "identity.users") return false;
  const named = normalized(id);
  if ([...IDENTITY_PROOF_RECORD_TYPES].some((type) => named.startsWith(`${type}:`))) return true;
  const recordType = data !== null && typeof data === "object" ? (data as { recordType?: unknown }).recordType : undefined;
  return typeof recordType === "string" && IDENTITY_PROOF_RECORD_TYPES.has(normalized(recordType));
}
