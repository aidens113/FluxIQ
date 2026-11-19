import type { ProgramApiActor } from "../../../_shared/api.ts";
import type { IdentityAccessService } from "../../runtime/service.ts";
import { SELF_SERVICE_REFUSALS, type NamedRefusal } from "./refusals.ts";

/** Where a person's own sign-in security is read and changed for one request (`signInStoreFor`). */
export type SignInStore = { ok: true; store: IdentityAccessService; delegated: false } | { ok: true; store: IdentityAccessService; delegated: true; actor: ProgramApiActor };

/**
 * The store a person's own sign-in security (authenticator, preferences, the
 * capitals of their name, their own sessions) is read and changed in. With no
 * other directory (`service.directory`, a local or self-hosted install) it is
 * this service, as it always was. In an instance whose people sign in through
 * another directory (a hosted tenant workspace) it is that directory, where
 * the caller's session and account are, and only for the caller: a request
 * that names anyone else (`userId`) is refused, whatever role the caller
 * holds, because a person's sign-in is their account's, not this workspace's.
 */
export async function signInStoreFor(service: IdentityAccessService, actor: ProgramApiActor | undefined, userId?: string): Promise<SignInStore | NamedRefusal> {
  const directory = await service.directory.elsewhere();
  if (directory === null) return { ok: true, store: service, delegated: false };
  if (!actor) return SELF_SERVICE_REFUSALS.authenticationRequired;
  if (userId !== undefined && userId !== actor.userId) return SELF_SERVICE_REFUSALS.directorySelfOnly;
  return { ok: true, store: directory, delegated: true, actor };
}
