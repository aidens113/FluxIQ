import { automationStudioSessionKeyProvider } from "../../models/secrets/index.ts";
// Releasing the configured key for one unattended call.
//
// This is the only place a standing authorization touches a credential, and it
// is split out from `provider.ts` so it can be asserted about directly: the
// refusals below are the whole of what stands between "the person turned
// checking on three months ago" and an outbound request, and a path that can
// only be driven by standing up Secret Keys and a live run is a path nobody
// writes an assertion about.
//
// Five refusals, in order, and each is a real one:
//
//   1. the Flow the check was authorized for, and no other -- a resolver reused
//      across Flows would be a standing authorization for the whole project;
//   2. the key must still be the enabled LLM key it was authorized against;
//   3. the key's own per-use authority must allow this use now, as the
//      `standing` principal bound to the stored grant: it finds the grant on
//      the Flow, then re-checks the person, the paired client they granted it
//      through (still vouched for by the gateway), the key's owner and IAM's
//      `secrets:UseKey`. No held session or unlock is consulted, so this works
//      after a restart with nobody signed in, and refuses for a revoked client,
//      a disabled person or key, or an IAM denial;
//   4. the authorization must come back for that same key at the same seal, or
//      the key was rotated or replaced underneath the grant;
//   5. the outbound body must not already contain the credential.
//
// When any of them refuses this throws, the provider resolution fails, and the
// run records `unverified` -- never `confirmed`.

import type { AutomationStudioResultCheckProviderPorts, AutomationStudioResultCheckProviderScope } from "./provider-contract.ts";

/**
 * How long the one-use authorization this mints may sit unclaimed.
 *
 * Unrelated to the standing authorization's own expiry: that says whether
 * checking may happen for the next ninety days, this says how long this one
 * release of the key may wait. It is claimed on the next line.
 */
export const AUTOMATION_STUDIO_RESULT_CHECK_REVEAL_TTL_MS = 10_000;

export async function revealAutomationStudioResultCheckSecret(input: {
  ports: AutomationStudioResultCheckProviderPorts;
  scope: AutomationStudioResultCheckProviderScope;
  providerId?: "anthropic" | "deepseek";
  model?: string;
  request: { projectId: string; flowId: string; outboundBody: string };
}): Promise<string> {
  const scope = input.scope;
  if (input.request.projectId !== scope.projectId || input.request.flowId !== scope.flowId) {
    throw new Error("Result check scope mismatch.");
  }
  const key = await input.ports.getKeySummary(scope.keyId);
  if (!key || !key.enabled || key.kind !== "llm") throw new Error("The key a result check was authorized against is unavailable.");
  if (input.providerId && automationStudioSessionKeyProvider(key) !== input.providerId || input.model && key.metadata?.model && key.metadata.model !== input.model) throw new Error("The result-check key does not match the selected provider and model.");
  const authorization = await input.ports.createUseAuthorization({
    id: scope.keyId,
    principal: { kind: "standing", userId: scope.authorizedByUserId, authorizationId: scope.authorizationId, projectId: scope.projectId, flowId: scope.flowId, purpose: scope.purpose },
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
