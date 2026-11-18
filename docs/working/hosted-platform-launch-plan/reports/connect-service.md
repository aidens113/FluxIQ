# Hosted browser PKCE service

Outcome: Done for the Core service/repository unit. Public web consent, real gateway issuance and live browser acceptance remain lead integration work.

## Implemented API

The new `packages/fluxiq/src/platform/connect/index.ts` exports:

- `createConnectService(options: ConnectServiceOptions): ConnectService`.
- `createSqliteConnectCodeRepository({ filePath }): ConnectCodeRepository`.
- `ConnectCredentialDeliveryError` and the supporting types in `model/types.ts`.

`ConnectService` exposes:

```ts
authorize(request: unknown, approvingSessionDigest: string): Promise<ConnectAuthorizationResult>;
exchange(request: unknown): Promise<ConnectExchangeResult>;
```

Authorization success is `{ ok: true, authorization: { code, state, redirectUri, expiresAt } }`.
Exchange success is `{ ok: true, response: ConnectTokenResponse }`.
Either operation can return `{ ok: false, error: ConnectTokenError }`; storage/authority failures throw instead of pretending an account or code is absent.

Constructor options are `repository`, fixed server `instanceOrigin`, fixed server `gatewayUrl`, optional `now`, and two mandatory ports:

```ts
validateApprovalSession(approvingSessionDigest: string): Promise<ConnectApprovalEligibility>;
issueCredential(input: ConnectCredentialIssueInput): Promise<ConnectIssuedCredential>;
```

Approval eligibility is `{ allowed: true, user: ConnectUserSummary, workspace: ConnectWorkspaceSummary }` or `{ allowed: false, error: "invalid_grant" | "email_unverified" | "account_disabled" | "client_limit_reached" }`.
The validator must read the current approving session, active account, verification policy and workspace membership; it runs at consent and again after a valid exchange proof durably spends the grant.

Credential input is exactly `{ userId, workspaceId, approvingSessionDigest, clientId: "fluxiq-browser-extension", clientInstallId, clientLabel }`.
The issuer returns `{ credential, credentialExpiresAt, connectedClientId }` from the existing ordinary-browser trust scheme.
It must persist the workspace route before returning and enforce account client limits at issuance.

`ConnectCodeRepository` supplies `save(record)`, atomic `consume(claim)` and `close()`.
Its private persisted record contains only code digest, fixed client, install, redirect, S256 challenge, user/workspace ids, approving-session digest, label and creation/expiry timestamps.
The store accepts no raw code, cookie, verifier or credential. Unknown-code probes do not create files or directories.

## Accepted and rejected flows

- Authenticated consent uses the existing authorize schema, accepts only S256 and the configured instance's exact `<origin>/connect/done` redirect, echoes state and generates a random 32-byte base64url code with the contract's 120-second lifetime.
- User/workspace authority comes exclusively from the injected validator. Payload actor/workspace/session claims and unknown fields confer no authority.
- Exchange validates the existing token request schema, computes RFC 7636 S256, then atomically matches the code digest, client, install, redirect, challenge and deadline under a SQLite write transaction.
- Wrong proof or binding does not burn valid consent. Unknown, used, expired and future-issued codes refuse. Wrong client/grant and malformed requests return the existing fixed OAuth error names without echoing inputs.
- A valid claim is durably consumed before invoking account/session revalidation or the issuer. Revalidation must still resolve the same user/workspace and the code must still be unexpired after that asynchronous lookup.
- The response is validated against `connectTokenResponseSchema`; expired or malformed issuer output is refused.

## Mint failure and lost replies

There is deliberately no exactly-once delivery claim. Durable claim provides at-most-once issuer invocation per authorization code, across connections, processes and reopen.
A crash after claim, authority failure after claim, issuer rejection, malformed issuer reply or lost successful HTTP response leaves that authorization spent.
Issuer failures throw sanitized `ConnectCredentialDeliveryError` (`code: "connect.credential_delivery_unknown"`) without retaining an exception cause that could contain private data.
There is no automatic issuer retry and replay never mints a second credential. The caller must restart consent when delivery is uncertain.
The real issuer should retain existing install-replacement semantics so fresh consent does not leave an earlier credential for the same install as an unintended additional client.

## SQLite behavior

Each operation owns an independent connection; SQLite `BEGIN IMMEDIATE` arbitrates writers across processes.
The repository uses DELETE rollback journals, FULL synchronization, secure deletion and the shared `framework/persistence/repository/locking` asynchronous busy retry.
It does not initialize WAL or use an in-memory mutex as the cross-process authority.
Duplicate authorization digests cannot replace bindings. Expired records are reclaimed in the next code-save transaction.
Corrupt, inaccessible, inconsistent or invalid stored evidence throws; it is never returned as an unknown code.

## Integration required

1. Lead re-exports the connect barrel through Core's existing public platform surface.
2. Compose the validator against actual platform session/account/membership state, with the authenticated cookie digested server-side. Do not use request actor/workspace ids or a submitted digest as authorization.
3. Compose the issuer against ordinary pre-socket gateway trust issuance and its authoritative platform routing store. Pending `approvePairing`, managed-host tickets and API keys are different flows.
4. Lead supplies server origin/gateway configuration and repository lifecycle. No request-supplied redirect allowlist or gateway endpoint is accepted.
5. Web consent remains authenticated and origin/CSRF guarded. Reject invalid authorization before redirect; bind the approved query to the authenticated consent decision.
6. Token endpoint remains a bounded, explicitly admitted public PKCE route. Map existing token error codes to documented statuses; use a generic server failure for thrown storage/authority/delivery failures, with no code/verifier/cookie/credential logging.
7. No revoke, reference-code flow, web/UI, public export, real issuer, gateway or constructor file was changed by this worker.

## Validation

- `pnpm.cmd exec vitest run src/platform/connect` in `packages/fluxiq` -> 49 tests passed in 2 files. This includes the RFC 7636 vector; exact redirects; malformed S256/verifiers; payload authority forgery; user/workspace rebound; revoked/disabled/unverified/session-ineligible authorities; deadline crossings; sanitized mint failures; malformed responses; lost replies; reopen; eight racing initial connections; and eight actual service processes yielding exactly one issuer invocation.
- Focused TypeScript API compilation using the package's parsed `tsconfig.json` and only `src/platform/connect/**` as root files -> 17 TypeScript files, 0 diagnostics. No emit/build performed.
- Owner-scoped structure audit (`node --input-type=module`, existing `createContext` filtered to connect paths, 15 source/import/test-placement rules) -> 18 source/test files, 0 failures. Corrected the subprocess's deep imports to use the runtime/storage barrels; reran the 49 tests afterwards and all passed.
- Initial test collection exposed an undeclared direct `zod` dependency; removed it and reused existing contract validators without changing package metadata. Two unsupported/mismatched test assertions were corrected before the clean 49-test run.
- Full package/repository suites, real gateway issuance, routes, HTTP policies and live browsers were not run. Peers were editing; the lead owns integrated verification.

Protocol references: [RFC 7636 section 4.6](https://www.rfc-editor.org/rfc/rfc7636#section-4.6), [RFC 6749 section 4.1.2](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2), and [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).

Outcome: Done
Changed: packages/fluxiq/src/platform/connect/**; docs/working/hosted-platform-launch-plan/reports/connect-service.md
Validation: `pnpm.cmd exec vitest run src/platform/connect` -> 49 passed after final barrel correction; focused connect-only TypeScript program -> 17 files, 0 diagnostics; owner-scoped structure audit -> 18 files, 0 failures.
Not verified: Public exports, real ordinary-browser gateway issuer, web consent/token routes, integrated account/session validator, HTTP policies and live browser behavior.
Report: docs/working/hosted-platform-launch-plan/reports/connect-service.md
Notes: No git, shared-document, gateway, package-metadata, server, network-provider or paid-run changes. Durable grant spend precedes issuance; uncertain delivery requires fresh consent.
