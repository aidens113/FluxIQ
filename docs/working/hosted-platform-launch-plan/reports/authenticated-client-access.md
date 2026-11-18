# Authenticated client access without a second unlock

Outcome: Done as a source-reviewed implementation design. Source, tests, builds and runtime data were not changed.

## Decision

An approved client is an independent authenticated principal. Its current credential, account state, tenant membership and IAM govern its continued access. The session that approved it is provenance; its later logout or expiry must not remove model-key capability from that still-authorized client. Remove the default `first_unlock`/lift/ticket mechanism and the corresponding Core, shared UI and extension waits and banners. Hiding the UI while leaving key release blocked does not satisfy this change.

The exact approving user's authenticated custody may delegate their own authorized keys. The previous reports' blanket prohibition on that delegation, zero-box locked enrollment default, and panel-session-end-to-client-lock propagation are superseded. Preserve their persistence-before-publication, current-authority, tenant isolation and crash-ordering requirements; their default lock outcome is no longer the design.

The smallest complete backend slice is **an encrypted host wrap of the existing record decryption key beside its existing V1/V2 value seal**, plus authenticated per-use authorization. This avoids rewriting every provider value or inventing a new ciphertext format before immediate access works. Existing credential-wrapped X25519 boxes remain useful for direct credential restoration and migration. They must stop being an additional authorization ceremony.

## What the source currently does

| Finding | Exact source and consequence |
| --- | --- |
| Values are password-encrypted, without host recovery. | `programs/secret-keys/runtime/value-sealer.ts:41,80,110,151` seals directly under a scrypt-derived AES key and checks the decrypted record id/rotation. An identity-session digest cannot derive that key. |
| Credential persistence already supports restart. | `programs/secret-keys/runtime/unlocks/crypto.ts` wraps each holder's X25519 private key under its credential and boxes record data keys to its public key. Current/pending generations preserve token rotation and lost-reply recovery. Store-only possession does not open these boxes. |
| Enrollment deliberately withholds capability. | `unlocks/credential-unlocks.ts:111,164` exposes `enrollLockedCredential` and creates a locked record on a verified first presentation. `create-credential-unlock-record.ts` writes empty boxes and `first_unlock`; `locked-credential-enrollments.ts` adds strict persistence/serialization around that outcome. |
| Normal later key proofs do not fix it. | `credential-unlocks.ts:404` skips a locked holder unless explicitly named in `reach.lift`. This blocks keys configured before approval and keys created afterwards. |
| Logout independently locks paired clients. | `credential-unlocks.ts:376-393` drops the panel holder, then locks paired holders approved by that digest; the own-signout branch can also lock clients whose approval session already ended or was unrecorded. Gateway trust is not thereby revoked. `locked-credential-enrollments.ts:sessionEnded` also cancels a provisional enrollment using that linkage. |
| Password changes use the same partial-auth model. | `credential-unlocks.ts:431` retains only the actor panel and already-unlocked clients it approved; others become key-locked. `runtime/credential-changes.ts` reseals current/pending password ciphertext. Replace partial locking with an explicit credential-revocation policy. |
| Model resolution requires held custody. | `runtime/models/secrets/session-key.ts:14,51,85` tries the caller and host-selected held session, then throws `secrets.locked`. `runtime/llm/session-key-provider.ts:106-176` turns that into an unlock wait. `_shared/runtime.ts:259-284` gives a paired client only its own held unlock; other paths choose a same-user panel unlock. Current key selection and `secrets:UseKey` checks must be preserved. |
| Web approval and login do not provide a complete tenant recovery path. | `apps/web/src/server/connect/trust-authority.ts:17-27` strictly enrolls a locked tenant holder. Reference approval (`app/api/client-gateway/approve-pairing/route.ts`) optionally asks for a password after approval to lift it. `app/api/auth/login/route.ts:115-131` opens primary Secret Keys, rather than every selected tenant store. Normal logout only revokes the cookie session; the custody subscriber creates the extra client lock. |
| Cold exchange cannot use approval provenance as decryption material. | `platform/connect/runtime/create-service.ts` and web connect issuance retain the approving session digest, not its cookie or decryption keys. After a process restart between consent and PKCE exchange, that digest still authenticates provenance but cannot open a cookie-wrapped private key. |
| Unattended access has an additional real dependency. | `runtime/result-verification/check-authorization/reveal.ts` validates standing scope but still calls `createSessionRevealAuthorization` with the old `unlockSessionId`. A durable permission alone cannot open password ciphertext after the held session is gone. Keep standing authorization's purpose/scope/budget checks; replace this custody dependency. |
| Workspace key sharing has real consent that must survive the change. | `runtime/conversations/assistant/model/key-model-source.ts` requires both the holder's offer and the workspace's explicit choice before another member's message can use that key. It currently depends on the owner's live panel unlock. Host recovery may remove that memory dependency, never the two consent checks. |
| Existing host protection is a pattern, not a configured Secret Keys vault. | `framework/persistence/automation/project/content-protection.ts:5,39` supplies AES-GCM through a host-owned key resolver and documents rotation/retirement. It is project/media-specific and has no default resolver or Secret Keys wiring. Identity `credential-seal.ts` is password-derived too. Source searches found no Secret Keys OS/KMS/master-key provider to enable. |
| Private deployment secret delivery already exists. | `deploy/compose/service.compose.yml:40-44,93-101` mounts private secrets. `deploy/cloud/runtime/write-config.py` allowlists secret names, writes private directories/files and atomically replaces them. `deploy/cloud/release/build.mjs` adds a private email-key mount. Extend those authored allowlists/mounts for a custody keyring; do not read real deployment secret files. |

All Core source paths above are beneath `packages/fluxiq/src/` unless prefixed otherwise. These are source findings, not exercised runtime results.

## Stable interfaces for the first slice

Use a focused collaborator so the existing service does not grow more unrelated facade methods. Publish owner-local types through barrels. The following is the proposed construction contract, not an implemented API:

```ts
// programs/secret-keys/runtime/protection/: in-process, never request input.
type SecretKeyProtectionContext = {
  storeId: string;       // Immutable host-supplied tenant/store identity.
  ownerUserId: string;   // Proven owner, not a freely editable legacy hint.
  recordId: string;
  sealDigest: string;    // Canonical digest of the exact current/pending seal.
};
type SecretKeyProtectedDataKey = {
  version: 1;
  providerId: string;
  keyId: string;
  ciphertext: string;
  iv: string;
  tag: string;
};
interface SecretKeyHostProtection {
  seal(input: {
    context: SecretKeyProtectionContext; dataKey: Uint8Array;
  }): Promise<SecretKeyProtectedDataKey>;
  open(input: {
    context: SecretKeyProtectionContext; sealed: SecretKeyProtectedDataKey;
  }): Promise<Buffer>; // Caller owns/zeroes this buffer.
}

// Bound at construction; authorization is checked again when the reveal is consumed.
interface SecretKeyUseAuthority {
  authorize(input: {
    principal: SecretKeyUsePrincipal;
    ownerUserId: string; keyId: string; purpose: SecretKeyUsePurpose;
  }): Promise<SecretKeyUseDecision>;
}
```

`SecretKeyUsePrincipal` is a trusted host-created panel, client or standing-authorization reference. Panel references validate the current session; client references validate the independently issued trusted-client credential/binding; standing references validate the durable authorized job scope. Request JSON cannot mint one by naming a user, holder or session digest. Existing API authentication creates it, and the use authority resolves it against primary identity, selected tenant membership and IAM. The protection port performs cryptography only; possession of the protector or a ciphertext row is not a public authorization API.

Expose `SecretKeysService.access.createUseAuthorization({ principal, id, purpose, ttlMs })` using the existing one-use reveal metadata shape, and consume it through the existing server-side reveal path. Capture key/seal version and authority revision; recheck current authority and record enabled/owner/version immediately before consumption. Keep provider values server-side, per call. General model use does not imply permission to reveal/copy a key through the UI or grant `secrets.manage`.

Replace strict locked enrollment with `credentialUnlocks.enrollCredential(holder, credential, { delegateFrom? })`. It persists a fresh authenticated holder before publishing trust. `delegateFrom`, when supplied, names **the exact validated approving user's live session in this tenant**; enforce same user, expiry, record version, and authorized ownership. It may populate missing host wraps and credential boxes from that session's actual held material. It never searches for a convenient unrelated session. No configured keys is a successful enrollment with no boxes, without a locked flag. An accessible host wrap makes cold enrollment independent of panel-memory custody.

The raw credential exists only transiently at issuance/presentation. The holder persists its existing ciphertext wrap, boxes, ids and approval provenance. Rotation retains the current/pending generation protocol. There is no need for a new mandatory consent-code encryption capsule once host-protected recovery is present.

## Storage, migration and lifecycle

1. Add optional `hostProtection` beside `SecretKeyRecord.sealed`, containing the protected data key and its authenticated owner/seal context. Add an equivalent `pendingHostProtection` paired with `pendingSealed`. Both are ciphertext only. Bind purpose/provider version, immutable store id, proven owner id, record id and exact seal digest as authenticated context. A wrap copied between users, stores, records or seal generations must fail. Do not bind ordinary display metadata changes to the cryptographic version.
2. New key creation/rotation computes the host wrap from the already-produced decryption key and commits the value seal plus matching wrap **in the same record write**. Required durable protection writes cannot use today's best-effort `quietly` path. Report success only after persistence. A failed/ambiguous write is reconciled from storage before publishing usable memory; no successful response backed only by an unpersisted wrap. Keep the existing single-live-process store ownership contract; this does not claim active-active cache coherence.
3. On normal password login, approved credential presentation, or exact own-session delegation, verify that the material opens this record's current seal and that ownership is established, then add the host wrap automatically. Keep V1/V2 seals readable; no bulk key deletion or blind ciphertext rewrite. A current credential box is also legitimate migration material. Historical `lockedAtMs`/`first_unlock` flags are not authority and must not block migration or release after current independent authentication succeeds.
4. Legacy `createdBy`/`sealedByUserId` conflicts and ownerless records need a bounded ownership migration. `sealedByUserId` is presently only a hint; never let adding a host wrap turn an ownerless legacy key into a key every authenticated user may use. Preserve exact credential-bound recovery until ownership is proven; require an explicit existing-owner/operator migration decision where old data has no reliable owner. That is data recovery, not per-client unlock setup.
5. Password-change prepare persists pending seal **and its matching host wrap**, leaves the current pair intact, and promotes or aborts both together. Seal-cost upgrades also replace the pair together. Rotation/deletion wins over a racing migration using exact-seal comparison. A crash must leave at least one authoritative current/pending seal with its own matching protection; never reuse the old wrap for the new seal. Host protection means authentication-password changes no longer need to make clients partially usable.
6. Remove `first_unlock`, `reach.lift`, `unlockTicket`, first-unlock notices and automatic paired-holder lock transitions from the authenticated path. Box newly created/rotated owner keys to all current same-user authorized holders, including both credential generations, without a lift gate. Per-use host recovery covers disconnected holders or retriable box propagation failure; delivery of all boxes is not a new readiness gate.
7. Ordinary panel logout/expiry revokes that panel principal and drops its panel holder/cache/reveals only. It must not match paired holders by `approvingSessionDigest`, by a list of remaining panel sessions, or by absence of historical provenance. Validate an approval session until issuance commits; logout racing an uncommitted approval may abort issuance. After independent issuance commits, that panel event has no client-auth effect.
8. Explicit client revoke/expiry, account disable, tenant-membership removal and IAM reduction deny new use immediately; revoke/disconnect or refuse the actual principal and invalidate outstanding reveal authorizations. Do not preserve a ready credential while merely erasing its boxes. Preserve issuer cleanup and persistence-before-publication under failures. Per-use current-authority checks are required even while a tenant is cold and no notification subscriber has run.
9. Security-reset policy must be explicit. Recommended policy: ordinary password change retains independent clients unless the user requests their revocation; password reset or an explicit “end all access” revokes affected sessions/clients/standing grants through the authoritative revocation path. A panel-only “end sessions” action may remain panel-only if named that way. Whichever policy is chosen, the UI/API reports actual authentication revocation; it never leaves a key-locked authenticated client. Do not infer this policy from the approving session digest.
10. On reconnect/restart, validate the existing token/session and current authority, open its boxes or the matching host wrap, and perform the first authorized call. No currently logged-in panel, extra password, PIN, ticket or manual lift is needed. An unattended job additionally requires its own existing standing authorization; host recovery must not create new permission to run arbitrary tasks or bill another person.

## Wrapping-key custody is a real host responsibility

The master wrapping secret must persist independently of process memory. Reuse the existing resolver pattern, with a Secret Keys-specific authenticated context rather than pretending a user id is an automation project id. A remote protector may keep the master inside a cloud KMS; the AES adapter may resolve key bytes from protected host secret storage. Neither provider values nor per-record decryption keys are stored in plaintext.

| Host | Concrete binding and limits |
| --- | --- |
| Service/production | Extend the existing private configuration secret and read-only secret mounts with a dedicated versioned custody keyring, e.g. `FLUXIQ_SECRET_KEYS_KEYRING_FILE`. Keep it separate from setup/provisioning/email secrets. Cloud secret-manager permissions, private file ownership and no logging are part of the host binding. A mounted keyring contains the **master secret** in the trusted host's memory/private secret file; database encryption does not remove that fact. No silent generated-file fallback for service. Missing/invalid required protection is a host configuration/startup error. |
| Local development | Prefer OS protected key storage when available. A bounded owner-private key file is an honest local fallback, created once with create-new/atomic publication and verified permissions/ACLs, outside database backups and source control. Its master key is plaintext in that private file; it protects a separately stolen DB, not an attacker who also reads the file or runs as the host user. Do not describe this fallback as KMS or OS-encrypted storage. Normal restarts must reopen it, never generate a replacement over missing historical material. |
| Headless/embedded Core | Supply the same protection and use-authority ports; do not put the only implementation in Next.js. A memory-only test host may use an ephemeral resolver and makes no restart promise. Durable hosts need a stable binding, without introducing a client unlock default when the binding is absent. |

Rotation makes a new key id current while old ids remain readable, rewraps each current/pending data-key envelope under the new id with exact-record comparison, verifies completion, then retires old ids. It need not decrypt/rewrite provider values. Keep resumable progress and ciphertext backups. Back up the required keyring versions through protected secret storage separately from database backups; restore both identities together. Never auto-regenerate a lost master key over existing wraps. A host possessing both the database and wrapping authority can decrypt user keys; that is the explicit server-custody trust boundary, while application IAM continues to isolate users.

Password-only historical ciphertext with no usable password, held derived key, credential box or existing host wrap cannot be decrypted by this feature. Import it during the **normal existing password login** or migrate/re-enter the affected saved key when its owner can recover it. This is an explicit `legacy_recovery_required` configuration/data-recovery condition, not `first_unlock`, not a reason to make every new client ask again, and not permission to delete the key. Master-key loss or invalid ciphertext has a similarly honest distinct error.

## Wire and UI contract

Connection/authentication readiness and model configuration are separate. A valid client remains connected with no configured provider key; adding its owner's key later enables use automatically. Disabled, mismatched or missing keys retain normal configuration errors. Revoked credentials produce authentication/authorization refusal or disconnection. Inaccessible legacy ciphertext or an unavailable protector is a specific saved-key/host configuration error; never manufacture `ready` by dropping the error.

Replace snapshot `unlocked`/`lockedBecause`, `lockedClients`/`neverUnlocked`/`unlockTicket` with an explicit model-key availability result. Suggested codes are `available`, `legacy_recovery_required`, `host_protection_unavailable`, and `ciphertext_invalid`; missing/disabled/provider mismatch remain existing configuration outcomes. Metadata exposes no data keys, credential material or foreign-user key details. `secrets:UseKey` permission remains distinct from listing/managing/revealing a key. Root/shared-contract ownership should freeze the exact public union before either UI worker implements it.

Remove the normal `secrets.locked`/`ModelKeyLockReason` route and `model_key_locked` person-wait producer, not just its text. Historical stored attempts with that wait need a compatibility reader that re-evaluates current authorization/configuration and resumes or reports the actual condition; it must not restore a nonexistent unlock gate after reboot. Keep genuine permission/person-only checks and other existing waits.

Affected surfaces include Core `contracts/src/platform/model-keys`, `contracts/src/task-attempts/model-key-lock.ts`, task-attempt wait types/readers, `ui-components/src/chat/onboarding/model-readiness.ts`, `chat/answer/words/waiting-words.ts`, `screens/tasks/model/{waiting,state}.ts`, and testing fixtures. Also remove model-key unlock messages in `_shared/runtime.ts`, conversation command gates and answer-first key-wait handling; ordinary provider errors must not be rewritten into a password wait.

Web removes the approval's optional password/TOTP unlock setup, the Keys unlock chooser/dialog/banner and ticket-fragment handling (`features/security/keys/manager/SecretKeysLive.tsx`, `manager/unlock/`). Key creation/rotation and explicit plaintext reveal retain their normal IAM/security policy; this change is not a blanket removal of mutation/reveal authorization.

Downstream removes “Unlock this browser once” from `panel/getting-started/start/{steps,view}.ts`, lock parsing in `model/key/{from-reply,reading}.ts`, the locked settings line, and background `panel-control`/`panel-control-deps`/`open-fluxiq` ticket plumbing. Update `automation-relay` snapshot projection and shared protocol to the same availability contract. The shared chat/task renderers change in Core. A settings-only extension patch would leave chat, tasks and backend blocked and is insufficient.

## Small implementation units and ownership

The first working increment comprises A-D below with one provider-free real integration test; E-F complete every requested UI/wire surface before declaring the correction finished. Freeze A's types and the public availability union first. Do not run tree-reading builds while any owner is mutating their partition.

| Unit | Owned files; dependency and acceptance |
| --- | --- |
| A: protection seam | New `programs/secret-keys/runtime/protection/{types,context,aes-gcm,index}.ts` and adjacent tests; `programs/secret-keys/types.ts`, `runtime/record-guard.ts`. Add optional authenticated current/pending wraps; keep old value seals readable. Verify context tampering, wrong key id, resolver loss, and wrapper rotation. Freeze types before B. |
| B: durable key access | `runtime/{service,key-store,seal-upgrades,credential-changes}.ts`, new focused `runtime/access/` collaborator, existing `runtime/unlocks/` helpers/tests. Persist wraps with every seal mutation, migrate legitimate own material, enroll without locks/lifts/tickets, preserve rotation/revoke/failure ordering. Own these files as one serial lane; another worker must not edit service/unlocks concurrently. |
| C: host protection binding | New neutral Core host-key resolver under `platform/custody/` and tests; production private-keyring loader/local private-file adapter. `deploy/cloud/runtime/{write-config.py,config.example.json,tests/test_write_config.py}`, `deploy/cloud/release/{build.mjs,tests}`, `deploy/compose/{service,self-hosted}.compose.yml`, authored env examples/operations docs. Use synthetic files only. Verify restart identity, missing-file refusal, permissions, mounts and retained key ids; never read actual deployment files. |
| D: authority and construction | Lead owns `framework/index.ts`, `programs/_shared/runtime.ts`, workspace/tenant construction, gateway `credential-custody.ts`, `trust-grant.ts`, `trust-issuance/issuer.ts`, web `server/connect/trust-authority.ts` and auth login/logout integration. Forward stable protection/store identity/use authority to each tenant. Delegate only from exact approving custody, migrate selected tenant during normal login, preserve credential persistence ordering. Stop consulting approval provenance for already-issued client lifetime. |
| E: model release and shared contract | `runtime/models/secrets/`, `runtime/llm/session-key-provider.ts`, `runtime/result-verification/check-authorization/`, `runtime/conversations/assistant/model/` plus existing caller/command/answer-first key-wait consumers. Remove held-panel dependence for authorized use and standing grants; preserve own-key selection, explicit workspace offers, provider/model/scope checks and billing limits. Coordinate shared contracts/UI files with the UI owner; do not both edit them. |
| F: web and downstream consumers | A disjoint UI owner changes the Core contract/UI paths listed above, web approval/Keys components, then downstream panel/background/protocol paths. No generic crypto or credential behavior downstream. Publish/build paired Core public exports before downstream checks. Test real readiness projection, no unlock step/dialog/banner/fragment and real unavailable-key/auth errors. |

`platform/custody/runtime` remains the generic home for the earlier report's durable revocation coordinator/replay and neutral participant provider, with web adapting current tenant leases only. Its events now revoke actual authentication/standing grants or invalidate key versions; they must not recreate hidden per-client key-lock state. Host wrapping simplifies password-data survival but does not itself make cross-store identity mutation and revocation transactions atomic.

## Required acceptance before completion

Use isolated temporary roots, synthetic provider keys and a fake provider transport; exercise the real identity, tenant, issuance, credential store, key repository and model resolver. A mocked unlock method or UI snapshot alone cannot prove this behavior.

1. Create an owner key, approve a reference-paired client without password/TOTP setup, immediately perform a real authorized model-key-backed operation and observe the fake transport receive the expected synthetic credential. Repeat for PKCE approval/exchange and for selected tenant keys rather than primary/operator keys.
2. Close the runtime, discard all HeldKeys/session memory, construct fresh services against the same temporary stores and stable host protector, then reconnect with the existing client credential and execute again. Repeat with a process restart **between PKCE consent and exchange**, within code/session validity. Verify lost rotation replies still accept only the intended current/pending tokens.
3. Log out the approving panel session and expire/revoke an unrelated panel session. Already-issued client operations still succeed; the ended panel session itself is refused. A logout before issuance commits may abort that unfinished grant, but must not publish an unpersisted or partially usable credential.
4. Approve when no key exists: authentication/connect succeeds and model use reports missing configuration, with no locked flag/wait/ticket. Add/rotate the same owner's key later through normal authenticated setup; the existing client uses it immediately, after reconnect and after a cold restart. No re-pair, lift or second password ceremony.
5. Disable/delete the key and use a wrong provider/model/Flow key: receive the specific configuration error. Remove `secrets:UseKey`, revoke client, disable account or remove membership: no later reveal/provider call, including after restart and while a tenant was evicted. Observe refusal/disconnection, never “ready but locked.” Re-enable/re-authorize only through the intended authentication policy.
6. Use two real accounts and two tenants. Foreign user/holder/session ids, copied wraps, same-named record ids, request-forged owner/store ids and an unrelated live administrator's session release no other user's or operator's key. Workspace-offered-key tests retain both explicit offer/choice checks, withdrawal checks and server-side secrecy.
7. Migrate a genuine V1/V2 owner key during normal login or valid credential presentation, restart with no password in memory, then use it. Prove ownerless/conflicting records do not become globally available. Missing recovery material and missing/incorrect master ids give honest distinct recovery/configuration errors; original ciphertext remains intact.
8. Inject failures/crashes at wrap write, seal/write, password-change prepare/promote/abort, grant/register and revoke. Fresh readers see consistent current/pending pairs; no accepted-but-unpersisted token/capability, stale version resurrection or unauthorized reveal. Verify master rotation/backup restore with old ids retained until migration completes.
9. Run an already-authorized unattended check after restart with no panel/client credential in memory. It uses the authorized key through host protection while retaining its exact existing purpose, key, Flow, expiry and budget scope. Revoked/expired standing authorization causes no provider call; ordinary client approval creates no new standing permission.
10. Shared chat/tasks, web Keys/approval and extension onboarding/settings have no first-unlock step, unlock banner, ticket URL or password wait for the successful paths. Recovered historical `model_key_locked` attempts re-evaluate and proceed. Actual missing-key, legacy-recovery and authentication errors remain visible and distinct.

Run the adjacent owner tests, touched-package typechecks and scoped structure/import/domain-neutral checks; the lead then independently runs the integrated scenarios. No full-suite run is required for this report or authorized during the current source freeze.

## Verification and residual constraints

Read-only source inspection was performed with `Get-Content`, `rg --files` and targeted `rg -n` searches in both task worktrees, plus authored deployment files. No tests, builds, browser sessions, provider calls, git operations or runtime/private-file reads were run. This report establishes an implementation path, not passing implementation evidence.

Historical unavailable ciphertext and unverifiable legacy ownership require real migration/recovery. Stable host wrapping-key storage, retained key ids and protected backup/restore are required for the restart guarantee. Existing single-process SecretKeyStore cache ownership remains unchanged. Per-call revalidation can block future use after revocation; it cannot recall a secret already transmitted to an upstream provider. The generic durable revocation coordinator remains separate necessary work for fully crash-ordered cross-store authority changes.

Outcome: Done
Changed: `docs/working/hosted-platform-launch-plan/reports/authenticated-client-access.md` only.
Validation: targeted source/deployment inspection -> current lock causes, logout coupling, credential recovery and missing host-custody binding traced; tests/builds not run (report-only brief and source freeze).
Not verified: proposed APIs, at-rest migration, restart/revocation behavior and UI removal are not implemented or exercised.
Report: `docs/working/hosted-platform-launch-plan/reports/authenticated-client-access.md`
Notes: Supersedes the previous default-lock recommendations. Exact-session authorized delegation is allowed. No source edits or git operations.
