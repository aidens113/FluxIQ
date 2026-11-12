import { asRecord, numberOf, textOf } from "../../../home/model";
import type { AccessRows, PersonRow, SessionRow } from "../types";

function shapeSession(raw: unknown): (SessionRow & { userId: string | undefined }) | undefined {
  const record = asRecord(raw);
  const digest = textOf(record?.id);
  if (!record || !digest) return undefined;
  return { digest, userId: textOf(record.userId), expiresAt: numberOf(record.expiresAtMs) };
}

/** People with their role's permissions and their sign-in sessions, from the identity-access snapshot. Sessions are named by digest, never a raw id. */
export function shapeAccess(payload: unknown): AccessRows {
  const root = asRecord(payload);
  const permissionsOf = new Map<string, string[]>();
  for (const role of Array.isArray(root?.roles) ? root.roles : []) {
    const record = asRecord(role);
    const id = textOf(record?.id);
    if (id) permissionsOf.set(id, (Array.isArray(record?.permissions) ? record.permissions : []).flatMap((permission) => (typeof permission === "string" ? [permission] : [])));
  }
  const sessions = (Array.isArray(root?.sessions) ? root.sessions : []).flatMap((raw) => {
    const session = shapeSession(raw);
    return session ? [session] : [];
  });
  const people: PersonRow[] = (Array.isArray(root?.users) ? root.users : []).flatMap((raw) => {
    const record = asRecord(raw);
    const id = textOf(record?.id);
    if (!record || !id) return [];
    const roleId = textOf(record.roleId) ?? "no role";
    return [{
      id,
      name: textOf(record.displayName) ?? textOf(record.username) ?? id,
      username: textOf(record.username) ?? id,
      roleId,
      permissions: permissionsOf.get(roleId) ?? [],
      enabled: record.enabled !== false,
      sessions: sessions.filter((session) => session.userId === id).map(({ digest, expiresAt }) => ({ digest, expiresAt }))
    }];
  });
  const known = new Set(people.map((person) => person.id));
  const otherSessions = sessions.filter((session) => !session.userId || !known.has(session.userId)).map(({ digest, expiresAt }) => ({ digest, expiresAt }));
  return { people, otherSessions };
}
