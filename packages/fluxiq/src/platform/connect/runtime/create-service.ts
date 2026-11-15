import { FLUXIQ_CONNECT_LIMITS, connectAuthorizeRequestSchema, connectRedirectUri, connectTokenResponseSchema, isSecureOrLoopbackUrl, isSessionDigest } from "@fluxiq/contracts/platform";
import type { ConnectService, ConnectServiceOptions } from "../model/index.ts";
import { ConnectCredentialDeliveryError, validateConnectEligibility } from "../model/index.ts";
import { connectCodeDigest, connectS256Challenge, createConnectAuthorizationCode } from "./pkce.ts";
import { parseConnectTokenRequest } from "./requests.ts";

/** Authorization-code PKCE orchestration, independent of browser UI, cookies and gateway construction. */
export function createConnectService(options: ConnectServiceOptions): ConnectService {
  if (typeof options.validateApprovalSession !== "function" || typeof options.issueCredential !== "function") throw new TypeError("Connect requires approval authority and ordinary-browser credential issuance.");
  if (!isSecureOrLoopbackUrl(options.instanceOrigin, "http") || new URL(options.instanceOrigin).origin !== options.instanceOrigin) throw new TypeError("Connect requires a secure instance origin, or loopback for local use.");
  if (!connectTokenResponseSchema.shape.gatewayUrl.safeParse(options.gatewayUrl).success) throw new TypeError("Connect requires a secure gateway URL, or loopback for local use.");
  const redirectUri = connectRedirectUri(options.instanceOrigin);
  const now = options.now ?? Date.now;
  function clock(): number {
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0 || time > Number.MAX_SAFE_INTEGER - FLUXIQ_CONNECT_LIMITS.authorizationCodeTtlMs) throw new TypeError("Invalid connect clock.");
    return time;
  }

  return {
    async authorize(input, approvingSessionDigest) {
      const parsed = connectAuthorizeRequestSchema.safeParse(input);
      if (!parsed.success || parsed.data.redirect_uri !== redirectUri) return { ok: false, error: { error: "invalid_request" } };
      if (!isSessionDigest(approvingSessionDigest)) return { ok: false, error: { error: "invalid_grant" } };
      const eligibility = validateConnectEligibility(await options.validateApprovalSession(approvingSessionDigest));
      if (!eligibility.allowed) return { ok: false, error: { error: eligibility.error } };
      const request = parsed.data;
      const createdAt = clock();
      const expiresAt = createdAt + FLUXIQ_CONNECT_LIMITS.authorizationCodeTtlMs;
      const code = createConnectAuthorizationCode();
      await options.repository.save({
        codeDigest: connectCodeDigest(code),
        clientId: request.client_id,
        clientInstallId: request.client_install_id,
        redirectUri,
        codeChallenge: request.code_challenge,
        userId: eligibility.user.userId,
        workspaceId: eligibility.workspace.workspaceId,
        approvingSessionDigest,
        clientLabel: request.client_label,
        createdAt,
        expiresAt
      });
      return { ok: true, authorization: { code, state: request.state, redirectUri, expiresAt } };
    },
    async exchange(input) {
      const parsed = parseConnectTokenRequest(input);
      if (!parsed.ok) return parsed;
      const request = parsed.request;
      if (request.redirect_uri !== redirectUri) return { ok: false, error: { error: "invalid_grant" } };
      const evidence = await options.repository.consume({
        codeDigest: connectCodeDigest(request.code),
        clientId: request.client_id,
        clientInstallId: request.client_install_id,
        redirectUri: request.redirect_uri,
        codeChallenge: connectS256Challenge(request.code_verifier),
        now: clock()
      });
      if (!evidence) return { ok: false, error: { error: "invalid_grant" } };
      const eligibility = validateConnectEligibility(await options.validateApprovalSession(evidence.approvingSessionDigest));
      if (!eligibility.allowed) return { ok: false, error: { error: eligibility.error } };
      if (eligibility.user.userId !== evidence.userId || eligibility.workspace.workspaceId !== evidence.workspaceId || evidence.expiresAt <= clock()) return { ok: false, error: { error: "invalid_grant" } };
      try {
        const issued = await options.issueCredential({
          userId: evidence.userId,
          workspaceId: evidence.workspaceId,
          approvingSessionDigest: evidence.approvingSessionDigest,
          clientId: evidence.clientId,
          clientInstallId: evidence.clientInstallId,
          clientLabel: evidence.clientLabel
        });
        const response = connectTokenResponseSchema.safeParse({
          credential: issued.credential,
          credentialExpiresAt: issued.credentialExpiresAt,
          connectedClientId: issued.connectedClientId,
          user: eligibility.user,
          workspace: eligibility.workspace,
          gatewayUrl: options.gatewayUrl
        });
        if (!response.success || response.data.credentialExpiresAt <= clock()) throw new ConnectCredentialDeliveryError();
        return { ok: true, response: response.data };
      } catch {
        // Never preserve an issuer exception/cause: it may contain the raw credential or server state.
        throw new ConnectCredentialDeliveryError();
      }
    }
  };
}
