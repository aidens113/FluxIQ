// The actor a paired client's token call runs as (t955): the person who approved
// the pairing, with their role's permissions narrowed to what paired calls need.
// `pairedClientActor` is the generic actor every paired caller uses -- the
// program route, the panel's app routes (`apps/web` app-route-iam) and a saved
// key's use by a trusted client (`apps/web` connect) -- and holds only
// `PAIRED_CLIENT_PERMISSIONS`, which lives in `programs/_shared/paired-client`
// so the key-access authority's paired actor reads the same set.
// `pairedClientEndpointActor` is the program route's, per endpoint: the generic
// actor plus what that one allowlisted endpoint names in
// `PAIRED_CLIENT_ENDPOINT_PERMISSIONS`, so `secrets.manage` rides on the
// person's own model-key writes and on no other call.

import { PAIRED_CLIENT_PERMISSIONS } from "../../programs/_shared/paired-client/index.ts";

/** A paired client's gateway session, as far as its actor and domain scope read it. */
export type PairedClientSession = {
  sessionId: string;
  operatorUserId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * The one more permission an allowlisted endpoint needs beyond
 * `PAIRED_CLIENT_PERMISSIONS`, carried by that endpoint's actor alone
 * (`pairedClientEndpointActor`) and never by the generic paired actor.
 *
 * `secrets.manage` on the person's own model key, saved, replaced or removed
 * (t928): the registry requires it for those writes. It was in the generic cap
 * until t955, which handed it to every paired actor -- every other program
 * endpoint, every app route and every saved-key use -- although none of them
 * needs it. Only a role that holds it keeps it, so a member's client is still
 * refused those three by IAM, exactly as the member's login is, and IAM still
 * decides them for an administrator's. Each entry must also be in
 * `PAIRED_CLIENT_ENDPOINTS`; this map widens only what an allowlisted
 * endpoint's actor carries, never which endpoints a token names.
 */
const PAIRED_CLIENT_ENDPOINT_PERMISSIONS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = Object.freeze({
  "secret-keys": Object.freeze({
    "save-model-key": Object.freeze(["secrets.manage"]),
    "replace-model-key": Object.freeze(["secrets.manage"]),
    "remove-model-key": Object.freeze(["secrets.manage"]),
  }),
});

type IdentityDirectory = {
  users: ReadonlyArray<{ id: string; roleId: string; enabled: boolean }>;
  roles: ReadonlyArray<{ id: string; permissions: readonly string[] }>;
};

type PairedClientActor<TPermission extends string> = {
  sessionId: string;
  userId: string;
  roleId: string;
  permissions: TPermission[];
  channel: "paired-client";
};

/**
 * The actor a paired client's call runs as: the person who approved the
 * pairing, with their role's permissions narrowed to the allowlist's, on the
 * `paired-client` channel (under the `service` profile the registry then
 * narrows it by those permissions as well as its person's policies). Null when
 * that person is gone, disabled or roleless, so disabling a person takes their
 * paired clients' reach with them.
 */
export function pairedClientActor<TPermission extends string>(session: PairedClientSession, directory: IdentityDirectory): PairedClientActor<TPermission> | null {
  return pairedActorWithin<TPermission>(session, directory, PAIRED_CLIENT_PERMISSIONS);
}

/**
 * The actor of one paired client call on the program route:
 * `pairedClientActor`'s, plus the permissions that endpoint alone names in
 * `PAIRED_CLIENT_ENDPOINT_PERMISSIONS`, each still only when the approving
 * person's role holds it. Every other endpoint gets exactly
 * `pairedClientActor`'s.
 */
export function pairedClientEndpointActor<TPermission extends string>(session: PairedClientSession, directory: IdentityDirectory, programId: string, endpoint: string): PairedClientActor<TPermission> | null {
  const own = PAIRED_CLIENT_ENDPOINT_PERMISSIONS[programId.trim().toLowerCase()]?.[endpoint.trim().toLowerCase()] ?? [];
  return pairedActorWithin<TPermission>(session, directory, own.length === 0 ? PAIRED_CLIENT_PERMISSIONS : [...PAIRED_CLIENT_PERMISSIONS, ...own]);
}

/** The approving person as a paired actor, their role's permissions narrowed to `allowed`; null when they are gone, disabled or roleless. */
function pairedActorWithin<TPermission extends string>(session: PairedClientSession, directory: IdentityDirectory, allowed: readonly string[]): PairedClientActor<TPermission> | null {
  const userId = session.operatorUserId;
  if (!userId) return null;
  const user = directory.users.find((candidate) => candidate.id === userId);
  if (!user?.enabled) return null;
  const role = directory.roles.find((candidate) => candidate.id === user.roleId);
  if (!role) return null;
  const permissions = role.permissions.filter((permission) => allowed.includes(permission)) as TPermission[];
  return { sessionId: `client-gateway:${session.sessionId}`, userId, roleId: role.id, permissions, channel: "paired-client" };
}
