// Test support: a real Secret Keys service as model-key ports, released through a held
// session's reveal (the service's own `createSessionRevealAuthorization`). The ports type
// requires `createUseAuthorization`, so a service under test is wrapped here; production
// composes `authenticatedModelKeyPorts` instead (`programs/_shared/key-access/model-ports.ts`).

import type { SecretKeysService } from "../programs/secret-keys/index.ts";
import type { AutomationStudioSessionKeyPorts } from "../runtime/models/secrets/index.ts";

/** `service` as ports. `authorizeUseKey`, when a test sets it on the service, is read at call time. */
export function heldSessionPorts(service: SecretKeysService, overrides: Partial<AutomationStudioSessionKeyPorts> = {}): AutomationStudioSessionKeyPorts {
  return {
    snapshot: () => service.snapshot(),
    createUseAuthorization: (input) => service.createSessionRevealAuthorization({ id: input.id, sessionId: input.sessionId, userId: input.userId, ttlMs: input.ttlMs }),
    revealKeyWithAuthorization: (input) => service.revealKeyWithAuthorization(input),
    revokeRevealAuthorization: (authorizationId) => service.revokeRevealAuthorization(authorizationId),
    authorizeUseKey: (userId, keyId) => {
      const decide = (service as unknown as { authorizeUseKey?: (userId: string, keyId: string) => Promise<boolean> }).authorizeUseKey;
      return decide ? decide.call(service, userId, keyId) : Promise.resolve(true);
    },
    ...overrides
  };
}
