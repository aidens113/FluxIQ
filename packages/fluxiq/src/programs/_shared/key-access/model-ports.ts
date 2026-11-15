import type { ClientGatewayService } from "../../../client-gateway/index.ts";
import { AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX } from "../../../runtime/conversations/commands/index.ts";
import type { AutomationStudioSessionKeyPorts } from "../../../runtime/models/secrets/index.ts";
import type { SecretKeysService } from "../../secret-keys/index.ts";

/** Translate a server-authenticated actor into a per-use principal without substituting a panel session. */
export function authenticatedModelKeyPorts(keys: SecretKeysService, gateway: ClientGatewayService): AutomationStudioSessionKeyPorts {
  return {
    snapshot: () => keys.snapshot(),
    createUseAuthorization: async ({ id, userId, sessionId, ttlMs, workspaceAssistant }) => {
      const purpose = workspaceAssistant ? { purpose: "workspace-assistant" as const } : {};
      if (sessionId.startsWith(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX)) {
        const gatewaySessionId = sessionId.slice(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX.length);
        const session = gateway.snapshot().sessions.find((item) => item.sessionId === gatewaySessionId && item.status === "ready" && item.operatorUserId === userId && !item.managedHostId);
        if (!session?.trustedClientId) throw new Error("The client is no longer authenticated.");
        return keys.access.createUseAuthorization({ id, principal: { kind: "client", userId, trustedClientId: session.trustedClientId, ...purpose }, ttlMs });
      }
      return keys.access.createUseAuthorization({ id, principal: { kind: "session", userId, sessionId, ...purpose }, ttlMs });
    },
    createSessionRevealAuthorization: (input) => keys.createSessionRevealAuthorization(input),
    revealKeyWithAuthorization: (input) => keys.revealKeyWithAuthorization(input),
    revokeRevealAuthorization: (id) => keys.revokeRevealAuthorization(id)
  };
}
