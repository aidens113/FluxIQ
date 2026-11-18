# Session-ready credential metadata integration discovery

Outcome: Done, report only. The next safe unit is additive transport metadata forwarding, followed by a tenant-bound server metadata provider and ordinary-client persistence adapter. No metadata source, contract, transport, host composition, test, build, private storage, server, provider, or git mutation was performed.

## Recommended stable interfaces

Keep the existing wire `ClientGatewaySessionReady` fields and add only optional metadata to the storage callback:

```ts
type ClientGatewayCredentialWriteMetadata = Readonly<
  Omit<ClientGatewaySessionReady, "token"> & { messageId: string }
>;

write(token: string, metadata?: ClientGatewayCredentialWriteMetadata): void | Promise<void>;
```

`commitSession` passes a detached copy of the actual server-ready payload minus token, with the envelope id as messageId, through its existing awaited write. The reconnecting connection forwards both arguments through `credentialWrites` and the existing superseded-socket checks. Existing one-argument consumers remain source/runtime compatible. There is no new token protocol and no persistence moved into a post-ready listener.

Proposed server-only provider:

```ts
type ClientGatewaySessionMetadata = {
  user: ConnectUserSummary;
  workspace: ConnectWorkspaceSummary;
};

type ClientGatewaySessionMetadataProvider = (input: Readonly<{
  trustedClientId: string;
  userId: string;
  clientType: ClientGatewayClientType;
}>) => Promise<ClientGatewaySessionMetadata | null>;
```

Add `sessionMetadata?: ClientGatewaySessionMetadataProvider` to `ClientGatewayServiceOptions` and forward `clientGatewaySessionMetadata?: ClientGatewaySessionMetadataProvider` through existing FluxIQ/runtime/tenant construction. The provider receives facts from the already verified authoritative trusted-client record, not hello metadata or an incoming workspace/user claim. It never receives a credential or computes expiration. Generic local callers without a provider retain existing behavior. Service web construction must always supply its tenant-closed provider for ordinary human client trust; a configured provider's null/error must refuse rather than omit metadata or fall back to pairing.

Apply the ordinary-human provider only to actual ordinary trusted records. A server-authorized `trustedClient.managedHost` is a distinct existing principal: do not fabricate a human email/workspace summary for it or make a client-supplied hello field choose this exception. Existing generic managed enrollment remains independently authorized and is not activated by the hosted extension path.

## Authoritative field sources

| Ready field | Actual source and required checks |
| --- | --- |
| token | The token returned by successful durable registry rotation, or the newly registered grant's token. Never client metadata. |
| credentialExpiresAt | The actual trusted client's persisted `expiresAt` following the successful issuance/rotation. `trusted-clients.ts` owns sliding lifetime and persistence. Neither browser nor metadata provider invents a TTL. |
| user.userId | The trusted record's `approvedByUserId`, checked against the enabled primary identity and current platform account. |
| user.displayName / email | `PlatformStore.getAccount(userId).displayName/email`, validated with the existing summary schema. No username/placeholder/email fabrication. |
| workspace.workspaceId | The immutable workspace id captured by tenant construction, with existing workspace and active membership for that same user. Never defaultWorkspaceId on reconnect or a hello/body claim. |
| workspace.name | Root's explicit decision: use the real workspaceId as an identifier display label when no stored descriptive label exists. This preserves the required wire field without inventing a descriptive workspace name. |
| messageId | Existing server envelope id; the transport forwards it to the private persistence callback. A consumer validates/maps it before using it as a local mutation identity. |

There is no stored workspace name today. `PlatformWorkspaceRecord` contains workspaceId/kind/ownerUserId/createdAtMs; it has no label. `validateConnectApproval` currently returns the literal name `"Workspace"`. The integration should replace that placeholder with the selected real workspaceId as the documented display-label fallback. No workspace-label persistence/schema migration belongs in this unit. Account display names/emails are real platform fields and must remain validated real values.

## Exact existing seams and gaps

- `packages/contracts/src/client-gateway.ts`: `ClientGatewaySessionReady` already has optional user/workspace/credentialExpiresAt. No wire widening is needed for this unit.
- `packages/client-gateway-websocket/src/types.ts`: storage write currently receives only token. `connection/types.ts` aliases that storage shape, so its public alias inherits an additive signature.
- `transport.ts: commitSession`: current order is awaited write, session/token assignment, credential_received, message event, session_ready event. Incoming frames are serialized behind that barrier. Preserve this order and fixed persistence failure handling.
- `connection/connection.ts: openRecord`: wraps writes with `credentialWrites` and active-socket guards, but forwards only token. It must forward metadata too. Its `onSessionReady` runs after transport acknowledgement and cannot supply the missing atomic persistence.
- `packages/fluxiq/src/client-gateway/service/lifecycle.ts: resumeTrustedSession`: current/previous proof verification, domain binding, rotation, custody, prior-session replacement, and ready emission. It currently sends only sessionId/token/projectId.
- `service/trust-grant.ts: grant`: shared local-reference/managed enrollment grant path; likewise emits no identity/expiry metadata. `sessions.attachTrustedClient` marks the session ready, so hosted metadata refusal must occur before that publication, not merely before the socket frame.
- `service.ts` constructs both collaborators, and `service/types.ts` owns options. A focused session-metadata helper should be shared by both paths rather than duplicating validation/error/late-trust checks.
- `trusted-clients.ts: commitRotation` updates expiresAt from server config and awaits persistence with rollback; `confirmCurrent` retains current/previous proof semantics. Do not reimplement these lifetimes in the client adapter.
- `framework/index.ts` and `programs/_shared/runtime.ts` already forward trusted-client-store and trust-authority options. Add the parallel metadata option through those same construction boundaries.
- `apps/web/src/lib/fluxiq.ts: createWebRuntimeState` constructs tenant stores and `createWorkspaceTrustAuthority(workspaceId)`. `lib/workspaces/create-tenant.ts` forwards those server-owned options into each FluxIQ instance; this is where a workspace-bound metadata provider belongs.
- `apps/web/src/server/account-access/eligibility.ts: workspaceAccountEligible` checks primary enabled identity, account status/deletion, workspace existence, and current exact membership. `browser-trust/authorize-binding.ts` already uses it for ordinary credential routes. Reuse it; provider lookup must not open a different user-selected tenant.
- `server/connect/approval.ts` is approval-session authority for issuance, while `trust-authority.ts` and `issue-credential.ts` validate that consent and enroll the independent credential. They are not a reconnect session requirement.

## Host resolver behavior

Introduce `createWorkspaceSessionMetadata(workspaceId)` under server/connect, using lazy existing getFluxIQAfterReload/getFluxIQWorkspaces/getPlatformServices ports. Require service multi tenancy, a non-primary actual tenant, the trusted owner's enabled primary identity, active account without pending deletion, an existing workspace, and current active membership using `workspaceAccountEligible`. Read real account summaries and return the constructor-bound workspaceId with the identifier fallback label; check all ids and shared summary schemas. Unavailable records or malformed summaries refuse. Provider exceptions produce fixed feedback without messages/causes that could quote credentials or private state.

The approving panel session may legitimately expire or log out while the separate credential remains valid. Do not call validateConnectApproval or require its digest on normal reconnect. Do not infer a new default workspace or silently move existing trust if membership ordering changes. Credential revocation, identity disablement, account disablement/deletion, and membership removal still refuse current authority. Model-key configuration and key recovery are unrelated to session-ready metadata; no password or unlock ceremony is introduced.

Before any credential-bearing custody work, obtain current hosted eligibility. After awaited rotation/custody/metadata/prior-socket work and immediately before ready publication, recheck the same live session and authoritative trusted record, active status, immutable owner/client/domain, and that the token being delivered is still current. Resolve current summaries after intervening waits rather than returning an early cached summary. A revoke during the metadata wait must stand. A provider denial/error must not return `false` into the generic resume-to-pairing fallback. A newly created but undelivered grant needs explicit cleanup; a temporary metadata-provider failure must not be misreported as proof reuse or client revocation.

## Exact source partitions

| Unit | Owned production / adjacent test paths | Dependency and proof |
| --- | --- | --- |
| A. Client transport | `packages/client-gateway-websocket/src/types.ts`, `transport.ts`, `connection/connection.ts`; optional focused metadata type file plus public index export; `src/tests/transport.test.ts` and `src/connection/tests/connection.test.ts` | Can start once signature freezes. Preserve detached payload, before-ack commit, queued frames, failed persistence, serialized writes and old-socket isolation; old one-arg consumers still work. |
| B. Generic server metadata | New `packages/fluxiq/src/client-gateway/service/session-metadata/**`; `service/types.ts`, `service/index.ts`, `client-gateway/service.ts`, `service/lifecycle.ts`, `service/trust-grant.ts`; new helper tests and focused lifecycle/grant acceptance under existing service tests | Freeze provider shape before C/D. Both actual send sites use the helper; authoritative expiry/current trust and no-ready refusal are exercised. No web account imports or new store. |
| C. Framework forwarding | `packages/fluxiq/src/framework/index.ts`, `packages/fluxiq/src/programs/_shared/runtime.ts`, existing focused construction tests | Serial root-owned public composition boundary. Forward only provider; keep local omitted defaults. Export provider type through existing public gateway barrel as needed. |
| D. Web host composition | New `apps/web/src/server/connect/session-metadata.ts` plus adjacent tests, `server/connect/index.ts`, `server/connect/approval.ts` and its tests, `lib/workspaces/create-tenant.ts`, `lib/fluxiq.ts`, focused tenant options/metadata tests | Root owns shared composition files. Reuse primary identity/account/membership; replace placeholder name with workspaceId fallback. Mandatory service provider, no client-selected tenant or approving-panel-session gate. |
| E. Hosted persistence adapter | New bounded background adapter/tests under extension credentials or later serial connection composition; existing `connection/gateway-session.ts` remains lead-owned wiring | After A/B/D and coordinated builds. Strictly validate metadata, compare current bound owner/workspace, use server expiry and pinned gateway plus PKCE connectedClientId, commit before ack. Never make up required summaries or TTL. |

No source paths were released or edited by this discovery. Partition C and shared D/E wiring should remain with the lead or be serialized explicitly. Service-managed principal applicability is an explicit B/D policy boundary, not a reason to weaken ordinary-client metadata checks.

## Persistence adapter and acceptance requirements

PKCE-first resume already has a durably adopted credential before hello, and the server rotates it on that first socket: persist its real new expiry as a rotation of the same installed user/workspace/client/lineage. Ordinary reconnect does the same, including accepted previous-proof recovery; do not revoke a previous proof as part of normal rotation. A hosted adapter lacking valid metadata refuses before acknowledgement and keeps its previous durable snapshot. Generic local/reference consumers may keep their old one-argument adapter.

The persistence callback receives identity/expiry from the actual ready frame and binding/client identity from its existing private repository. Its normalized response must pass the existing strict token-response schema and repo owner/gateway/expiry checks. Capture one exact expected revision and private operation identity for the logical commit. Map/validate the message id into the repository's bounded identifier vocabulary; do not use a fresh random operation id for retries. An exact already-durable token/metadata snapshot may be recognized as committed without inventing another mutation. Conflicting reuse, late old socket, user/workspace change, or changed binding must not overwrite a newer credential.

Provider-free acceptance should cover current and previous tokens; first PKCE socket and normal reconnect; local reference and generic managed enrollment compatibility; actual stored expiration matching ready expiration; real account summaries and workspaceId display fallback; expired approving panel session with still-valid client; disabled user/account, removed membership, missing/wrong tenant, malformed provider output, sanitized provider exceptions; revoke/replacement during awaited metadata; no session ready or credential publication on refusal; metadata passed through both direct/reconnecting clients; detached callback inputs; durable transaction before ack/ready/queued command; invalid hosted metadata preserving the previous credential; operation-id replay/CAS and late socket isolation; old single-argument storage consumers. A separate browser proof still owns real extension-origin storage isolation.

Validation: source inspection and report link/path review only, per brief. No test/build/live/provider execution. Not verified: proposed interfaces, provider implementation, server population, transport forwarding, composed adapter, or end-to-end browser behavior. The lead independently accepted the prior credential foundation; that result does not prove this metadata integration exists.
