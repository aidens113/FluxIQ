import type { ConnectTokenError, ConnectTokenErrorCode, ConnectTokenResponse, ConnectUserSummary, ConnectWorkspaceSummary } from "@fluxiq/contracts/platform";

/** Private authorization evidence. Never contains a raw authorization code, verifier, cookie or credential. */
export type ConnectCodeRecord = {
  codeDigest: string;
  clientId: "fluxiq-browser-extension";
  clientInstallId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  workspaceId: string;
  approvingSessionDigest: string;
  clientLabel: string;
  createdAt: number;
  expiresAt: number;
};

export type ConnectCodeClaim = Pick<ConnectCodeRecord, "codeDigest" | "clientId" | "clientInstallId" | "redirectUri" | "codeChallenge"> & { now: number };

export type ConnectCodeRepository = {
  save(record: ConnectCodeRecord): Promise<void>;
  /** A successful match is durably spent before returning. No caller may undo or retry it. */
  consume(claim: ConnectCodeClaim): Promise<ConnectCodeRecord | null>;
  close(): Promise<void>;
};

export type ConnectEligibilityError = Extract<ConnectTokenErrorCode, "invalid_grant" | "email_unverified" | "account_disabled" | "client_limit_reached">;

export type ConnectApprovalEligibility =
  | { allowed: true; user: ConnectUserSummary; workspace: ConnectWorkspaceSummary }
  | { allowed: false; error: ConnectEligibilityError };

/** Server-derived authority only; none of these bindings come from the unauthenticated token body. */
export type ConnectCredentialIssueInput = {
  userId: string;
  workspaceId: string;
  approvingSessionDigest: string;
  clientId: "fluxiq-browser-extension";
  clientInstallId: string;
  clientLabel: string;
};

export type ConnectIssuedCredential = Pick<ConnectTokenResponse, "credential" | "credentialExpiresAt" | "connectedClientId">;

export type ConnectAuthorization = { code: string; state: string; redirectUri: string; expiresAt: number };

export type ConnectAuthorizationResult =
  | { ok: true; authorization: ConnectAuthorization }
  | { ok: false; error: ConnectTokenError };

export type ConnectExchangeResult =
  | { ok: true; response: ConnectTokenResponse }
  | { ok: false; error: ConnectTokenError };

export type ConnectService = {
  /** Called only after authenticated consent. The second argument is the authenticated panel session's digest. */
  authorize(request: unknown, approvingSessionDigest: string): Promise<ConnectAuthorizationResult>;
  exchange(request: unknown): Promise<ConnectExchangeResult>;
};

export type ConnectServiceOptions = {
  repository: ConnectCodeRepository;
  instanceOrigin: string;
  gatewayUrl: string;
  /**
   * Mandatory trusted authority: verify the approving session still exists, is active and unexpired;
   * its account is active, meets the email policy and still belongs to the returned workspace.
   * Return current display summaries, not claims copied from the request. Run at consent AND exchange.
   */
  validateApprovalSession(approvingSessionDigest: string): Promise<ConnectApprovalEligibility>;
  /**
   * Use the existing ordinary-browser trust issuer; persist its workspace route before returning.
   * Enforce current account client limits atomically there. A thrown/rejected result may already have
   * committed issuance: this service never retries it. No raw credential is persisted by connect.
   */
  issueCredential(input: ConnectCredentialIssueInput): Promise<ConnectIssuedCredential>;
  now?: () => number;
};
