// Releasing the configured key for one unattended verification call.
//
// This is the only place a standing authorization touches a credential, and it
// is split out from `provider.ts` so it can be asserted about directly: the
// refusals below are the whole of what stands between "the person turned
// checking on three months ago" and an outbound request, and a path that can
// only be driven by standing up Secret Keys and a live run is a path nobody
// writes an assertion about.
//
// Four refusals, in order, and each is a real one:
//
//   1. the Flow the check was authorized for, and no other -- a resolver reused
//      across Flows would be a standing authorization for the whole project;
//   2. the key must still be the enabled LLM key it was authorized against;
//   3. the reveal must come back for that same key at the same seal, or the
//      key was rotated or replaced underneath the authorization;
//   4. the outbound body must not already contain the credential.
//
// The reveal itself is minted from the person's held key unlock, which
// `createSessionRevealAuthorization` refuses unless the unlock is live and
// belongs to `authorizedByUserId`. When it has lapsed this throws, the provider
// resolution fails, and the run records `unverified` -- never `confirmed`.

import type { AutomationStudioResultCheckProviderPorts, AutomationStudioResultCheckProviderScope } from "./provider-contract.ts";

/**
 * How long the one-use reveal this mints may sit unclaimed.
 *
 * Unrelated to the standing authorization's own expiry: that says whether
 * checking may happen for the next ninety days, this says how long this one
 * release of the key may wait. It is claimed on the next line.
 */
export const AUTOMATION_STUDIO_RESULT_CHECK_REVEAL_TTL_MS = 10_000;

export async function revealAutomationStudioResultCheckSecret(input: {
  ports: AutomationStudioResultCheckProviderPorts;
  scope: AutomationStudioResultCheckProviderScope;
  request: { projectId: string; flowId: string; outboundBody: string };
}): Promise<string> {
  const scope = input.scope;
  if (input.request.projectId !== scope.projectId || input.request.flowId !== scope.flowId) {
    throw new Error("Result check scope mismatch.");
  }
  const key = await input.ports.getKeySummary(scope.keyId);
  if (!key || !key.enabled || key.kind !== "llm") throw new Error("The key a result check was authorized against is unavailable.");
  const authorization = await input.ports.createSessionRevealAuthorization({
    id: scope.keyId,
    sessionId: scope.unlockSessionId,
    userId: scope.authorizedByUserId,
    ttlMs: AUTOMATION_STUDIO_RESULT_CHECK_REVEAL_TTL_MS
  });
  if (authorization.keyId !== key.id || authorization.keyUpdatedAtMs !== key.updatedAtMs) {
    input.ports.revokeRevealAuthorization(authorization.authorizationId);
    throw new Error("The key a result check was authorized against changed.");
  }
  const revealed = await input.ports.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: scope.keyId });
  const secret = revealed.value;
  if (input.request.outboundBody.includes(secret)) {
    revealed.value = "";
    throw new Error("Result check request contains the configured credential.");
  }
  return secret;
}
