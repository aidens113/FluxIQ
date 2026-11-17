import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import type { ConnectAuthorizeRequest, ConnectTokenRequest } from "@fluxiq/contracts/platform";
import type { ConnectApprovalEligibility, ConnectCredentialIssueInput, ConnectIssuedCredential, ConnectServiceOptions } from "../index.ts";
import { createConnectService, createSqliteConnectCodeRepository } from "../index.ts";

/** Every file, identity, cookie and credential is synthetic and confined to an isolated temporary authority. */
export async function connectFixture(cleanups: Array<() => Promise<void>>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-connect-"));
  const filePath = path.join(directory, "platform", "connect.sqlite");
  const clock = { now: 1_000_000 };
  const rawCookie = "synthetic-approval-cookie-not-persisted";
  const sessionDigest = createHash("sha256").update(rawCookie).digest("hex");
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const authorizeRequest: ConnectAuthorizeRequest = {
    client_id: "fluxiq-browser-extension",
    redirect_uri: "https://app.example.com/connect/done",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "synthetic-state-0123456789",
    client_install_id: "synthetic-install-1",
    client_label: "Synthetic browser"
  };
  const authority: { eligibility: ConnectApprovalEligibility } = {
    eligibility: {
      allowed: true,
      user: { userId: "user.synthetic", displayName: "Synthetic User", email: "synthetic@example.com" },
      workspace: { workspaceId: "workspace.synthetic", name: "Synthetic workspace" }
    }
  };
  const validateApprovalSession = vi.fn(async (digest: string): Promise<ConnectApprovalEligibility> => digest === sessionDigest ? authority.eligibility : { allowed: false, error: "invalid_grant" });
  const issueCredential = vi.fn(async (_input: ConnectCredentialIssueInput): Promise<ConnectIssuedCredential> => ({
    credential: "synthetic-issued-credential-never-persisted-0123456789",
    credentialExpiresAt: clock.now + 60_000,
    connectedClientId: "browser.synthetic"
  }));
  cleanups.push(async () => {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("fluxiq-connect-")) throw new Error("Invalid synthetic connect cleanup target.");
    await rm(resolved, { recursive: true, force: true });
  });
  function openRepository(databasePath = filePath) {
    const repository = createSqliteConnectCodeRepository({ filePath: databasePath });
    cleanups.push(() => repository.close());
    return repository;
  }
  const repository = openRepository();
  function createService(overrides: Partial<ConnectServiceOptions> = {}) {
    const defaults: ConnectServiceOptions = { repository, instanceOrigin: "https://app.example.com", gatewayUrl: "wss://app.example.com/gateway", validateApprovalSession, issueCredential, now: () => clock.now };
    return createConnectService({ ...defaults, ...overrides });
  }
  const service = createService();
  async function authorize() {
    const result = await service.authorize(authorizeRequest, sessionDigest);
    if (!result.ok) throw new Error("Synthetic connect consent did not authorize.");
    return result.authorization;
  }
  function tokenRequest(code: string): ConnectTokenRequest {
    return { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: authorizeRequest.redirect_uri, client_id: authorizeRequest.client_id, client_install_id: authorizeRequest.client_install_id };
  }
  return { directory, filePath, clock, rawCookie, sessionDigest, verifier, authorizeRequest, authority, validateApprovalSession, issueCredential, repository, openRepository, createService, service, authorize, tokenRequest };
}
