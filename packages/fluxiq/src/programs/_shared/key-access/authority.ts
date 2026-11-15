import type { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import type { SecretKeysService, SecretKeyUseAuthority, SecretKeyUsePrincipal } from "../../secret-keys/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor } from "../api.ts";

export type SecretKeyPrincipalAuthority = (principal: SecretKeyUsePrincipal) => Promise<{ actor: ProgramApiActor; expiresAtMs: number } | null>;

/** Local host authority. Hosted tenants supply primary identity and membership checks instead. */
export function localSecretKeyUseAuthority(input: {
  identity: IdentityAccessService;
  gateway: ClientGatewayService;
  keys: SecretKeysService;
  api: GlobalProgramApiRegistry;
  resolvePrincipal?: SecretKeyPrincipalAuthority;
}): SecretKeyUseAuthority {
  return async ({ principal, key }) => {
    if (principal.kind === "standing") return null;
    let actor: ProgramApiActor;
    let expiresAtMs: number;
    if (input.resolvePrincipal) {
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
      const directory = await input.identity.snapshot();
      const user = directory.users.find((candidate) => candidate.id === principal.userId && candidate.enabled);
      const role = user && directory.roles.find((candidate) => candidate.id === user.roleId);
      if (!role) return null;
      actor = { userId: principal.userId, sessionId: `trusted-client:${principal.trustedClientId}`, roleId: role.id, permissions: role.permissions.filter((p) => ["programs.read", "programs.write", "runtime.control", "flows.write"].includes(p)), channel: "paired-client" };
      expiresAtMs = Date.now() + 10_000;
    }
    const ownerUserId = key.createdBy;
    if (!ownerUserId) return null;
    if (ownerUserId !== principal.userId) {
      if (principal.purpose !== "workspace-assistant") return null;
      const choice = await input.keys.modelKeys.resolveAssistant();
      if (!choice.ok || choice.keyId !== key.id || choice.ownerId !== ownerUserId || !choice.chosenForWorkspace || !choice.offeredByHolder) return null;
      // The holder's explicit offer delegates this one assistant use, never key reveal or arbitrary Flow use.
      if (!(await input.api.authorize({ actor, action: "studio:SendPanelMessage", permission: "programs.write", resources: { kind: "user", self: true }, programId: "automation-studio" })).allowed) return null;
    } else if (!(await input.api.authorize({ actor, action: "secrets:UseKey", permission: "programs.write", resources: { kind: "key", keyId: key.id }, programId: "secret-keys" })).allowed) return null;
    return { ownerUserId, expiresAtMs };
  };
}
