import type { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { AutomationStudioResultCheckGrantor } from "../../../runtime/result-verification/check-authorization/index.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import type { SecretKeysService, SecretKeyUseAuthority, SecretKeyUsePrincipal } from "../../secret-keys/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor } from "../api.ts";

export type SecretKeyPrincipalAuthority = (principal: SecretKeyUsePrincipal) => Promise<{ actor: ProgramApiActor; expiresAtMs: number } | null>;

type StandingPrincipal = Extract<SecretKeyUsePrincipal, { kind: "standing" }>;

/**
 * The live grant a `standing` principal is bound to, or null when none matches:
 * the Flow's stored result-check authorization, found by its id, for that
 * person and purpose, unexpired. Supplied by the host, which owns the Flows.
 */
export type SecretKeyStandingGrantResolver = (principal: StandingPrincipal) => Promise<{ grantedThrough: AutomationStudioResultCheckGrantor; keyId: string; expiresAtMs: number } | null>;

/** What a paired client's actor may do, as `server/program-route` narrows it. */
const PAIRED_CLIENT_PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"];

/** How long one decision for a principal with no session of its own stands. The use it authorizes is claimed at once. */
const UNSESSIONED_DECISION_MS = 10_000;

/** Local host authority. Hosted tenants supply primary identity and membership checks instead. */
export function localSecretKeyUseAuthority(input: {
  identity: IdentityAccessService;
  gateway: ClientGatewayService;
  keys: SecretKeysService;
  api: GlobalProgramApiRegistry;
  resolvePrincipal?: SecretKeyPrincipalAuthority;
  /** Binds a `standing` principal to its stored grant. Absent, every standing use is refused. */
  resolveStanding?: SecretKeyStandingGrantResolver;
}): SecretKeyUseAuthority {
  /** The person as the identity directory has them now, with the permissions the channel they act through allows. */
  const directoryActor = async (userId: string, sessionId: string, client: boolean): Promise<ProgramApiActor | null> => {
    const directory = await input.identity.snapshot();
    const user = directory.users.find((candidate) => candidate.id === userId && candidate.enabled);
    const role = user && directory.roles.find((candidate) => candidate.id === user.roleId);
    if (!role) return null;
    return client
      ? { userId, sessionId, roleId: role.id, permissions: role.permissions.filter((p) => PAIRED_CLIENT_PERMISSIONS.includes(p)), channel: "paired-client" }
      : { userId, sessionId, roleId: role.id, permissions: role.permissions };
  };
  return async ({ principal, key }) => {
    let actor: ProgramApiActor;
    let expiresAtMs: number;
    if (principal.kind === "standing") {
      // A person's standing grant for one Flow (a result check, or the repair
      // clause beside it). It is used with nobody present, so there is no
      // session to validate: instead the grant itself must still be stored,
      // the person must still be enabled, and a client they granted it
      // through must still be vouched for by the gateway.
      const grant = await input.resolveStanding?.(principal);
      if (!grant || grant.keyId !== key.id || !(grant.expiresAtMs > Date.now())) return null;
      const viaClient = grant.grantedThrough.kind === "client" ? grant.grantedThrough.trustedClientId : undefined;
      if (viaClient !== undefined && !await input.gateway.vouchesForClient(viaClient, principal.userId)) return null;
      if (input.resolvePrincipal) {
        const current = await input.resolvePrincipal(viaClient !== undefined ? { kind: "client", userId: principal.userId, trustedClientId: viaClient } : principal);
        if (!current || current.actor.userId !== principal.userId || current.expiresAtMs <= Date.now()) return null;
        actor = current.actor;
      } else {
        const found = await directoryActor(principal.userId, viaClient !== undefined ? `trusted-client:${viaClient}` : `standing:${principal.authorizationId}`, viaClient !== undefined);
        if (!found) return null;
        actor = found;
      }
      expiresAtMs = Math.min(Date.now() + UNSESSIONED_DECISION_MS, grant.expiresAtMs);
    } else if (input.resolvePrincipal) {
      const current = await input.resolvePrincipal(principal);
      if (!current || current.actor.userId !== principal.userId || current.expiresAtMs <= Date.now()) return null;
      actor = current.actor;
      expiresAtMs = current.expiresAtMs;
    } else if (principal.kind === "session") {
      const auth = await input.identity.validateSession(principal.sessionId);
      if (!auth || auth.user.id !== principal.userId) return null;
      actor = { userId: auth.user.id, sessionId: principal.sessionId, roleId: auth.role.id, permissions: auth.role.permissions, channel: "panel" };
      expiresAtMs = auth.session.expiresAtMs;
    } else {
      if (!await input.gateway.vouchesForClient(principal.trustedClientId, principal.userId)) return null;
      const found = await directoryActor(principal.userId, `trusted-client:${principal.trustedClientId}`, true);
      if (!found) return null;
      actor = found;
      expiresAtMs = Date.now() + UNSESSIONED_DECISION_MS;
    }
    const ownerUserId = key.createdBy;
    if (!ownerUserId) return null;
    if (ownerUserId !== principal.userId) {
      // A standing grant pays only with the person's own key: the workspace
      // assistant's delegation never reaches a Flow nobody is watching.
      if (principal.kind === "standing" || principal.purpose !== "workspace-assistant") return null;
      const choice = await input.keys.modelKeys.resolveAssistant();
      if (!choice.ok || choice.keyId !== key.id || choice.ownerId !== ownerUserId || !choice.chosenForWorkspace || !choice.offeredByHolder) return null;
      // The holder's explicit offer delegates this one assistant use, never key reveal or arbitrary Flow use.
      if (!(await input.api.authorize({ actor, action: "studio:SendPanelMessage", permission: "programs.write", resources: { kind: "user", self: true }, programId: "automation-studio" })).allowed) return null;
    } else if (!(await input.api.authorize({ actor, action: "secrets:UseKey", permission: "programs.write", resources: { kind: "key", keyId: key.id }, programId: "secret-keys" })).allowed) return null;
    return { ownerUserId, expiresAtMs };
  };
}
