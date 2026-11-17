# Authenticated client trust issuance

Outcome: Done for the ordinary pre-socket issuer and registry unit. Actual platform validation, strict tenant key delivery and web consent are composition/integration work owned by the lead.

## Frozen and implemented API

The new `packages/fluxiq/src/client-gateway/service/trust-issuance/index.ts`, re-exported by `service/index.ts`, exports `ClientGatewayTrustIssuer`, its types, validators and `ClientGatewayTrustIssuanceError`.
Lead-owned `service.ts` exposes it as `gateway.trust` and wires this constructor:

```ts
new ClientGatewayTrustIssuer({
  config, trustedClients, authority: options.trustAuthority,
  sessions, transport, audit, trace, facade, custody
});
```

`gateway.trust.issue(input)` returns `Promise<ClientGatewayIssuedTrust>`.
`ClientGatewayApprovedTrustInput` is exactly:

```ts
{
  clientId: string;
  clientType: ClientGatewayClientType;
  clientInstallId: string;
  name: string;
  domainId: string | null;
  approvedByUserId: string;
  approvingSessionDigest: string;
}
```

The result is `{ credential, credentialExpiresAt, trustedClientId }`.
Connect composition maps that last field to the existing token response's `connectedClientId`.

`ClientGatewayServiceOptions.trustAuthority` is optional for compatibility. Pre-socket issuance fails closed if it, mandatory persistence or either mandatory authority operation is missing; local pairing and managed enrollment retain their existing options.

```ts
type ClientGatewayTrustAuthority = {
  validateApproval(input: {
    userId: string;
    approvingSessionDigest: string;
  }): Promise<{
    userId: string;
    approvingSessionDigest: string;
    maxActiveClients: number;
  } | null>;
  grantCredential(input: {
    credential: string;
    trustedClientId: string;
    userId: string;
    approvingSessionDigest: string;
    expiresAt: number;
  }): Promise<void>;
};
```

The validator must read actual active session/account/membership authority and return the exact approved user and digest. A caller's actor/workspace fields are not authentication.
The strict `grantCredential` port propagates failure and must use the validated tenant/person/session evidence; a best-effort custody observer is not a substitute.
No raw session id/cookie or held key is passed into the issuer or stored by it.

## Issuance and persistence

- `trustedClients.issueApproved` validates inside the registry's existing serialized mutation queue, computes the owner's current active ordinary clients, identifies the same owner/client/install to replace, then checks the remaining count against the trusted policy limit.
- Replacement applies across a changed domain for that same installation. Other installations or users remain trusted. Managed-host records are not ordinary client quota entries or replacement candidates.
- One mandatory save persists all replaced revocations and the new trust together. The new trust has a fresh id and the existing signed credential scheme, with only digests and private metadata persisted.
- A failed save removes the fresh trust and restores every replaced object's fields and current/previous credential indexes. Strict delivery is not called.
- Replaced custody is forgotten and live sessions disconnected. Failure to send a disposable disconnect notice is safely audited by exception name; the session is still disconnected.
- After the saved batch, mandatory delivery runs once. Informational `custody.issued` uses a distinct `approvedBySessionDigest` field; the legacy raw `approvedBySessionId` field is not set.
- After awaited delivery/custody, authority is checked again and the exact saved trust must remain active before the raw credential is returned.
- The registry's public view strips `approvingSessionDigest` with hashes/signing state. Lead added optional `clientInstallId`/`approvingSessionDigest` contract metadata and its immutable platform binding validation; this worker did not edit contracts/platform.
- Hello now requires matching client type alongside the existing id and domain checks. Wrong type refuses rather than allowing another declared kind to resume the same trust.

## Failure, concurrency and deployment limits

`ClientGatewayTrustIssuanceError` contains a fixed safe message, `reason` and `code: client_trust.<reason>`, without preserving provider/storage exception causes.
Reasons are `invalid_input`, `unavailable`, `approval_refused`, `client_limit_reached`, `persistence_failed`, `delivery_failed`, `trust_ended` and `cleanup_failed`.

A strict delivery failure or late authority/trust refusal attempts durable revocation before throwing. If revocation cannot persist, the result is `cleanup_failed`; no credential is published, but the persisted row may remain active and requires recovery. It is not reported as successfully revoked.
The issuer never retries a possibly completed strict grant. A lost reply may already have committed both trust and delivery. The PKCE service must keep its authorization spent and require new consent; another explicit valid consent creates a fresh replacement rather than assuming idempotent delivery.
When replacement commits and its later strict delivery fails, the old trust stays revoked. Publishing a fresh credential or reviving old trust is not a safe rollback.

In-process concurrent issuance is serialized with other registry mutations; the batch respects replacement and owner quota. Independent stale gateway snapshots fail the platform store's SQLite generation CAS, restore their in-memory state and publish nothing. The issuer does not silently reload a gateway around active sessions or automatically retry that conflict.
This supports the declared single-Core-process deployment, not active-active gateway coherence. A stale independent runtime requires reload and fresh consent. No claim of cross-process gateway refresh or active-session synchronization is made.
The quota is the owner count in the injected gateway/store's scope. Account-wide limits across multiple workspace gateways require trusted composition to coordinate admission across those scopes; this scoped registry alone does not establish a global account count.
The server must choose the gateway `clientId` consistently with the client's actual hello identity; the public PKCE application id and an install identity have different roles.

## Validation

`pnpm.cmd exec vitest run src/client-gateway/service/trust-issuance src/client-gateway/service/tests/trusted-clients.test.ts src/client-gateway/service/tests/pairing-flow.test.ts src/client-gateway/service/tests/credential-lifetime.test.ts src/client-gateway/service/tests/credential-reuse.test.ts src/client-gateway/service/tests/credential-custody.test.ts src/client-gateway/service/enrolment/tests` in `packages/fluxiq` -> **83 tests passed in 8 files**, including 20 new issuer cases.

New cases exercise real SQLite pre-socket route proof, correct/wrong client id/type/domain, metadata restart/privacy, absent authority/persistence, current/queued authority revocation, cross-user session refusal, save rollback, mandatory delivery failure, post-delivery authority revocation, eight concurrent distinct installations under quota, same-install replacement, another owner/install preservation, replacement rollback, independent stale CAS, replaced live-socket failure and consent replacement while strict delivery waits.
Existing local pairing, custody, lifetime/reuse and managed enrollment regressions all pass.

Focused TypeScript program rooted at the new issuer subtree and four changed service subjects -> **11 roots, 0 diagnostics**.
Owner-scoped existing structure audit with its ratchet and 15 source/import/test-placement rules -> **0 failures**, 4 advisory warnings, 13 existing baseline entries. The registry is now 413 lines, above the 400-line advisory and below the 800-line enforced limit; its added behavior owns the same durable trust state.

No whole package suites/builds, live browser, public HTTP consent, actual platform identity/key delivery, cloud/server or paid calls ran in this worker unit. Lead independent verification and application composition remain required.

Outcome: Done
Changed: client-gateway/service/trust-issuance/**; service/{trusted-clients,credential-custody,lifecycle,types,index}.ts; this report.
Validation: focused 8-file gateway regression command -> 83 passed; focused TypeScript -> 11 roots, 0 diagnostics; scoped structure -> 0 failures.
Not verified: Actual platform approval and strict tenant custody, account-wide admission across workspace scopes, active-active gateway coherence, HTTP/UI or live browsers.
Report: docs/working/hosted-platform-launch-plan/reports/connect-issuer.md
Notes: No git, platform/contracts, public facade, framework/runtime or external-repository edits. Single-process registry atomicity and independent stale-writer refusal are explicit. Mandatory delivery failure never returns a credential.
