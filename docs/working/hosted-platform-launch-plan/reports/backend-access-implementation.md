# Authenticated key access backend

Outcome: Done within the owned backend partition. Lead integration/build validation remains separate.

## Result

Approved clients no longer acquire a default key lock. Strict enrollment persists an independent credential envelope without `first_unlock`, and an exact approving session may delegate its already-authenticated same-owner material. Ordinary panel logout removes panel custody and pending approvals; it does not remove a committed independent client's custody. New keys and normal owner proofs reach current vouched holders without a lift/ticket gate.

Existing password-encrypted V1/V2 values remain encrypted in their existing format. A matching host-encrypted data-key wrap supplies durable recovery independently of panel-session memory. The host supplies stable key custody and an immutable store identity. Every authenticated model-key use requires a current explicit principal/authority decision and is checked again when the one-use release is consumed. A model-use release is distinct from privileged plaintext reveal.

The public snapshot emits `availability: ModelKeyAvailability` for own keys and `heldByYou: false` on explicitly foreign-owned rows. It emits no `unlocked`, `lockedBecause`, `lockedClients` or `unlockTicket` fields. Ownerless historical records report `legacy_recovery_required`; no owner is inferred from an encryption hint. The `unlock` API handler and ticket implementation are retired. Some old names/types remain as deprecated read/import compatibility and produce no unlock ceremony.

## Owned changes

All paths below are relative to `packages/fluxiq/src/`.

| Area | Changes |
| --- | --- |
| `platform/custody/protection/` | New AES-GCM protector, strict authenticated context/envelope validation, stable host-key resolver port, unavailable-key error, barrel and seven tests. No host-secret loader, OS implementation or key generation lives here. |
| `programs/secret-keys/runtime/access/` | Focused data-key protection/recovery, authenticated use collaborator, explicit principal/authority types, semantic record-version comparison, real availability errors and opaque one-use management proofs. Mint-time snapshots exclude only reveal-audit time during comparison. |
| `programs/secret-keys/runtime/{service,key-store,held-keys}.ts` | Constructor/access wiring; required seal/wrap persistence before publishing create/rotation state; ambiguous-write reconciliation; fresh authority/version checks during use; availability snapshots; private management-proof reveal; in-memory authority/version bindings. |
| `runtime/{credential-changes,seal-upgrades}.ts` | Matching current/pending host wraps accompany password reseals, prepare/commit/abort/settle and KDF upgrades. Legitimate changes preserve independently authorized clients. |
| `runtime/unlocks/` | `credential-enrollments.ts` replaces the locked-enrollment implementation filename while preserving fresh-holder/conflict/failure ordering. `enrollCredential` accepts exact-session delegation. Presentation persists delegated envelopes before holding their keys. Digest equality prevents borrowing another same-user panel. Ordinary panel endings do not propagate client locks. Ticket source removed; compatibility methods are no-ops. |
| `programs/secret-keys/{types,index}.ts` | Protected current/pending key fields, availability metadata and public protector/access exports. A strict-holder named-type barrel export was requested from the lead as a final integration precision; the method's declared parameter already exposes the shape. |
| `programs/secret-keys/api/` | Retired unlock handler; unchanged registry owner/list filtering; trusted primary identity accessor resolved per privileged check; mandatory actor/proof-session and current-user match; separate reauthenticated management reveal with fresh session/role/IAM checks. |
| Adjacent tests | Replaced obsolete first-unlock/logout expectations with the corrected semantics while retaining credential tampering, ownership, rotation/lost-reply, forget/reconnect, failed-write and SQLite enrollment coverage. Added authenticated recovery, concurrency, exact delegation, primary/tenant separation and management-proof regressions. |

No contracts, external runtime caller, framework composition, web/extension production source, deployment file, shared working document or git state was changed by this worker. The lead owns those integrations.

## Frozen interfaces

```ts
new SecretKeysService({
  hostProtection?: SecretKeyHostProtection,
  protectionStoreId?: string,
  useAuthority?: SecretKeyUseAuthority,
  // Existing repository, clock, password KDF and held-key options remain.
});

type SecretKeyUsePrincipal =
  | { kind: "session"; userId: string; sessionId: string;
      purpose?: "workspace-assistant" }
  | { kind: "client"; userId: string; trustedClientId: string;
      purpose?: "workspace-assistant" }
  | { kind: "standing"; userId: string; authorizationId: string;
      projectId: string; flowId: string;
      purpose: "loop_verification" | "repair" };

type SecretKeyUseAuthority = (input: {
  principal: SecretKeyUsePrincipal; key: SecretKeySummary;
}) => Promise<{ ownerUserId: string; expiresAtMs: number } | null>;

service.access.createUseAuthorization({ id, principal, ttlMs? });
// -> existing SecretRevealAuthorizationMetadata
service.revealKeyWithAuthorization({ id, authorizationId });
```

There is no null/anonymous authorized principal. A user id or approval digest alone is insufficient. The host must validate the actual panel/client/standing authority, current user/tenant/IAM, expiry and any delegated scope. The optional `workspace-assistant` purpose lets the host preserve existing explicit workspace choice plus owner offer without impersonating the owner. Ordinary model use still requires its own current key permission. An absent use authority refuses use.

The AES adapter is `new AesGcmSecretKeyHostProtection(resolveKey)`. Its resolver takes `{ storeId, keyId? }` and returns `{ keyId, key: Uint8Array }` or `undefined`, synchronously or asynchronously. The adapter copies and zeroes its working key buffer; ownership of the host's resolver key remains with the host.

The protection context is `{ storeId, ownerUserId, recordId, sealDigest }`. The ciphertext envelope is `{ version: 1, providerId, keyId, ciphertext, iv, tag }`. Store, owner, record, exact seal digest, key id and purpose/provider version are authenticated. The public primitive consumes no browser/domain context. `SecretKeyProtectionUnavailableError` distinguishes an unavailable resolver key; service use errors are `SecretKeyAccessUnavailableError` with `legacy_recovery_required`, `host_protection_unavailable` or `ciphertext_invalid`.

`credentialUnlocks.enrollCredential(holder, credential, { delegateFrom? })` requires fresh persistent enrollment and rejects duplicate/conflicting holders. Delegation is `{ sessionId, userId }`, must be live same-user custody, and must hash to the holder's actual approving-session digest. `presentCredential(..., { verified: true, delegateFrom? })` supports idempotent presentation/delegation of an already-enrolled holder; it is the correct observer seam after strict hosted issuance. The old `enrollLockedCredential` name is a deprecated no-lock alias, not a locked enrollment operation.

`registerSecretKeysApi(registry, service, identityAccess?, keySessionOf?)` now accepts either an existing instance or a trusted async accessor. `SecretKeyIdentityAuthority` is `Pick<IdentityAccessService, "validateSession" | "authorizeSessionCredentials" | "authorizeSessionPasswordPin">`. The source is construction-only and never request-controlled.

## Persistence and security behavior

- New values/rotations persist a complete seal plus host wrap before publishing the new record or holding its new key. Migration commits against the exact current record. A driver rejection after commit is reconciled from the repository before the cache is reused. Another semantic rotation/deletion wins over stale work; a KDF reseal can be followed by the intended newer rotation.
- Current and pending password seals keep their own matching wraps. Promotion and rollback move/remove both fields together. No provider value or per-record raw decryption key is persisted. Required recovery writes never use best-effort credential-box propagation.
- Password/credential material must actually authenticate the current record before it can gain a host wrap. An existing wrap is retained only if it opens to the same verified key. A retired/missing master or corrupt wrap can be repaired from legitimate same-owner material using an already-configured current host key; this does not generate a production master or claim to recover unavailable ciphertext.
- Model-use authorizations bind a copy of the explicit principal, the proven key owner and a structured clone of the semantic record at mint. Consumption checks that version and current authority before and after asynchronous work. All semantic fields count, including same-clock provider/owner/enabled/metadata/seal changes; only `lastRevealedAtMs` is ignored, so concurrent valid audit writes do not spuriously reject calls.
- Privileged plaintext reveal first passes registry `secrets:RevealKey` plus current-password reauthentication against the primary identity. An internal WeakMap proof binds key/actor/reveal/short expiry and is consumed once. Its callback revalidates the primary session/current user and fresh-role/current tenant IAM at consumption and before return. The mint is not exported by the public `fluxiq/secret-keys` barrel. A serialized object, actor id or model-use grant cannot substitute for that proof.
- This management path fixes the isolated tenant case where primary password changes leave an older tenant value seal under the previous password: reauthenticate with the current primary password, then open the matching host wrap for the authorized own-key reveal. Rotation already supplies a new value and can seal it under the current reauthenticated password without the previous one.
- Explicit authentication revocation remains the host's responsibility. Clearing cached boxes is not a replacement for denying/revoking the actual credential. Backend use revalidation prevents a stale independent principal from using host recovery after the authority callback refuses it.

## Observed validation

Commands ran from `packages/fluxiq` with synthetic keys/accounts and temporary/in-memory repositories only. No provider, email, browser or paid service was called.

| Check | Observed result |
| --- | --- |
| `pnpm.cmd exec vitest run src/platform/custody/protection/tests/aes-gcm.test.ts src/programs/secret-keys/runtime/tests/authenticated-access.test.ts` | Initial implementation: 16 tests / 2 files passed. |
| `pnpm.cmd exec vitest run src/programs/secret-keys` | Initial diagnostic: 210 passed / 42 failed, 24 files. Most failures asserted the superseded lock/ticket/logout outcome; one existing concurrent-reseal test assumed publication before persistence. The latter was changed to assert persistence ordering and the underlying rotation race was fixed. |
| `pnpm.cmd exec vitest run src/platform/custody/protection/tests/aes-gcm.test.ts src/programs/secret-keys/runtime src/programs/secret-keys/api/tests/authenticated-use.test.ts` | 236 passed / 1 failed, 20 files. The sole remaining failure expected omitted foreign ownership rather than the requested explicit `heldByYou: false`; assertion corrected. |
| `pnpm.cmd exec vitest run src/programs/secret-keys src/platform/custody/protection/tests/aes-gcm.test.ts` | 259 tests / 26 files passed; duration 86.57 seconds. Includes one real SQLite strict-enrollment reopening test. |
| `pnpm.cmd exec vitest run src/programs/secret-keys/runtime/tests/authenticated-access.test.ts src/programs/secret-keys/runtime/access/tests/version.test.ts src/programs/secret-keys/api/tests/authenticated-use.test.ts src/platform/custody/protection/tests/aes-gcm.test.ts` | After final mint-time version binding, explicit known-error catch and compatibility comments: 38 tests / 4 files passed; duration 5.98 seconds. |

The final focused cases prove immediate authorized use, fresh-service restoration, enrollment before key configuration, later key use without lifting, panel-logout independence, exact approving-session digest enforcement, foreign/same-user-wrong-session refusal, delegated-envelope write failure, an ambiguous rotation write, retained current/pending recovery pairs, normal-login repair under a replacement configured master, cross-store context failure, current credential revocation, eight concurrent uses, same-clock semantic changes, primary/tenant identity separation, current-password reveal after a primary-only password change, wrong/foreign proof refusal, revoked session/role during reveal, expired/reused management proof and model/management capability separation.

The lead reported earlier Core/UI builds and Core/web typechecks passing at the coordinated checkpoint. Those preceded the final semantic-binding/catch/comment changes; the final integrated rebuild/typecheck and independent acceptance reruns belong to the lead. The runtime acceptance worker reported 15 tests and no-emit diagnostics passing; that remains a subordinate claim until the lead reruns it. This worker ran no package build, whole-package check, whole-repository suite or git command.

## Limits and integration ownership

The lead supplies default local/OS/production wrapping-key storage, trusted principal and primary-identity callbacks, model/runtime callers, contracts, shared UI, web/extension and operational documentation. This worker did not independently verify the root's DPAPI/private-file/secret-mount adapters or browser behavior.

The tests exercise actual Secret Keys/identity/API services, source crypto and serialized repository restoration, plus real SQLite credential enrollment. They do not claim an actual server/browser reboot or live provider request. The real routed runtime uses independent integration tests owned by the lead/runtime worker.

Old ciphertext with no valid password/key/credential box/host wrap cannot be decrypted. Ownerless legacy data is not silently adopted. The protector requires stable host key custody and retained/readable wrapping ids; process restart does not manufacture a replacement master. Existing single-live-process SecretKeyStore ownership remains in force. No durable cross-store identity/revocation journal or active-active cache protocol was implemented here. Standing principals are explicit and require real host authorization/redemption binding; the backend never treats absent session material as authority.

Outcome: Done
Changed: owned Secret Keys production/tests, new `platform/custody/protection/**`, this report.
Validation: touched-area run -> 259/259 passed; final security-focused rerun -> 38/38 passed.
Not verified: final integrated build/types/reruns, live browser/provider/reboot, host keyring adapters and durable cross-store revocation ordering.
Report: `docs/working/hosted-platform-launch-plan/reports/backend-access-implementation.md`
Notes: No source outside the owned backend partition, no git operations. Final source/test stability sent to lead; report-only changes followed.
