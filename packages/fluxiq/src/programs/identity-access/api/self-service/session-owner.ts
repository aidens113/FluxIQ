import type { IdentityAccessService } from "../../runtime/service.ts";

/** The owner of the session a revoke names, in `store`: by raw id (validated there) or by the digest a listing shows. Null when there is none. */
export async function sessionOwner(store: IdentityAccessService, target: { sessionId?: string | undefined; sessionDigest?: string | undefined }): Promise<string | null> {
  if (target.sessionId !== undefined) return (await store.validateSession(target.sessionId))?.user.id ?? null;
  return (await store.snapshot()).sessions.find((session) => session.id === target.sessionDigest)?.userId ?? null;
}
