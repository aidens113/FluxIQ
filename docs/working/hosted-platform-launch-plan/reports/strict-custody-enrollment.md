# Strict locked-holder enrollment

Outcome: Done for the scoped unlock-owner API. Source is stable for lead validation.

## Exact integration API

```ts
await tenant.programs.secretKeys.credentialUnlocks.enrollLockedCredential(
  {
    holderKind: "paired-client",
    holderId: secretKeyPairedHolderId(trustedClientId),
    userId,
    approvingSessionDigest, // Already the primary session digest; do not hash again.
    expiresAtMs: expiresAt,
    label: clientName, // Optional.
  },
  credential,
);
```

The method returns `Promise<void>`. `SecretKeyLockedCredentialHolder` is exported through the existing `runtime/unlocks/index.ts` barrel. The existing public `SecretKeysService.credentialUnlocks` property exposes the method; no construction, web, gateway or identity source was edited here.

Replace the provisional `presentCredential` call with this method. Do not call both: strict enrollment intentionally rejects **every existing holder**, including an exact duplicate. There is no idempotent early-success path. A failed enrollment can be retried only after its provisional state has actually been removed. Overlapping identical calls serialize with one successful enrollment and a fresh-holder rejection; conflicting pending user/digest/expiry/credential bindings reject immediately.

The host remains responsible for trusted workspace selection, primary session/user/membership validation, pairing identity, trust persistence, revocation rollback and post-grant authority checks before publishing the credential. This API takes the already-authorized tenant-local binding; it does not authenticate an arbitrary supplied digest or workspace.

## Changes and guarantees

- New `locked-credential-enrollments.ts` owns strict per-holder enrollment sequencing, pending binding conflicts, cancellation and mandatory persistence. It uses the existing record constructor/credential-wrap cryptography and existing repository/write queue, with no second key scheme.
- A configured persistence repository is mandatory. Missing persistence, invalid paired-holder identity, a raw/noncanonical approval digest, expired binding, empty credential or `heldAs` override rejects. Production must supply its durable adapter; the generic Repository interface does not itself distinguish a test memory implementation from SQLite.
- Fresh records contain the exact user/digest/expiry binding, a credential-wrapped private key, zero boxes and the existing `first_unlock` lock. Enrollment never calls the key store, enumerates live sessions, borrows an unlocked session, lifts a hold or creates a HeldKeys entry. No model key is required.
- Persistence completes before the record enters the in-memory unlock map. A failed write leaves no provisional memory or held keys. A write that committed before reporting failure is compensated through the same ordered write queue. If compensation itself fails, both failures propagate and a retry detects the persisted row and refuses to publish it as fresh.
- Forget, direct lock, whole-person lock and matching session-end events cancel pending enrollment, await its completion/cleanup and retain their ordinary lock behavior. An ended approval digest cannot enroll later in the same service instance. A separate still-live approval survives another session's ordinary signout.
- Ordinary presentation, rotation and confirmation wait for any enrollment of the same holder to settle, so they cannot create or mutate a competing provisional row. Existing non-enrollment local credential behavior remains covered by its focused suites.
- Extracted existing digest/holder identity helpers into `holder-identity.ts`, preserving their existing named exports through `credential-unlocks.ts`. This kept the source under its 800-line budget; `credential-unlocks.ts` is 754 lines. No baseline exception was added.

This uses the deployment's existing single mutation owner per tenant. It does not add cross-process insert/CAS to the generic Repository port or implement the separate primary-to-cold-tenant identity event coordinator. Platform trust's immutable identity binding and host lifetime management remain separate prerequisites.

## Observed validation

- `pnpm.cmd --filter fluxiq exec vitest run src/programs/secret-keys/runtime/unlocks/tests/strict-enrollment.test.ts src/programs/secret-keys/runtime/unlocks/tests/strict-enrollment-sqlite.test.ts` -> initial **22/22 passed**.
- `pnpm.cmd --filter fluxiq exec vitest run src/programs/secret-keys/runtime/unlocks` -> **4 files, 107/107 passed**, duration 4.67 s. This includes 26 strict cases and the existing 81 proof/lifecycle cases.
- Strict tests cover durable SQLite success/reopen; missing persistence; exact zero-box binding; existing owner/digest/expiry/credential conflict; write refusal and real retry; ambiguous post-commit failure compensation; failed compensation refusing retry publication; overlapping same/conflicting bindings; no borrowing from either own or another user's held keys; forget/direct lock/person/session/whole-user/signout races; unrelated live approval; ended digest; and expiry during pending persistence.
- Focused TypeScript probe from `packages/fluxiq`: `node --input-type=module` with a stdin compiler-API script loading `tsconfig.json`, selecting only the unlock directory's files, and requesting options/syntactic/semantic diagnostics for those selected files -> **"Focused unlock semantic/type check passed: 11 files."** The initial `pnpm ... node -e` launch lost quotes through PowerShell and failed before type checking (`import ts from typescript`); piping the script through stdin corrected that shell issue.
- `node scripts/structure-audit.mjs --rule imports --rule web-vocabulary --rule exported-values --rule naming --rule file-lines --rule directory-files --rule failure-as-empty --rule import-cycles --rule swallowed-failure --json` -> **no unlock-owned failures**. Current-tree exit 1 identified two other active owners: the web key-sessions `management-` prefix count, and swallowed failures in WebSocket `start-server.ts`. Both were reported to the lead; no exception/bypass was added.

No whole build/check, live server, browser, model/cloud call, real data read, git mutation or outside-owned source edit was performed. Lead was sent the stable-source signal before beginning its contracts/Core build; only this report was edited afterward.

## Return contract

Outcome: Done
Changed: `programs/secret-keys/runtime/unlocks/{credential-unlocks,holder-identity,locked-credential-enrollments,index}.ts`, three focused strict test/support files, and this report.
Validation: `pnpm.cmd --filter fluxiq exec vitest run src/programs/secret-keys/runtime/unlocks` -> 107/107 passed; focused semantic/type probe -> 11 files passed; selected structure -> no owned failures, two reported external failures.
Not verified: Lead construction/web/gateway integration, full build/typecheck/structure, primary identity/membership authority, cold-tenant event replay and cross-process enrollment isolation.
Report: `docs/working/hosted-platform-launch-plan/reports/strict-custody-enrollment.md`
Notes: Strict API rejects all existing holders and never borrows keys. Basic connection accepts zero model keys. No git/source edits after the stable-source signal.
