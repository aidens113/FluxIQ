# t808 / held-keys (lane C0): key custody outside the instance

## Outcome

Done. A `SecretKeysService` can be given a `HeldKeys` that outlives it. Closing it in `evict` mode
leaves that custody as it is. With no `HeldKeys` given and a default `close()`, behaviour is the
same as before.

## What changed and why

- `packages/fluxiq/src/programs/secret-keys/runtime/held-keys.ts`
  - New `sessionExpiryTimer(sessionId, delayMs)` and `authorizationExpiryTimer(authorizationId, delayMs)`.
    Each one creates the timer, calls `unref()` on it, and returns it.
  - Each callback captures only `this` (the HeldKeys) and the id. The method has no other closure,
    so its V8 context holds nothing else.
  - The class doc now describes the custody split.
- `packages/fluxiq/src/programs/secret-keys/runtime/service.ts`
  - The constructor option `heldKeys?: HeldKeys | undefined` is set before `SealUpgrades` and
    `CredentialChanges` are built, so both of them get the injected instance.
  - `ownsHeldKeys` is true only when no HeldKeys was given.
  - New exported type `SecretKeysCloseMode = "shutdown" | "evict"`.
  - The signature is now `close(options: { mode?: SecretKeysCloseMode } = {})`. It calls `revokeAll()`
    unless `mode === "evict"` and the HeldKeys was injected, then calls `credentialChanges.forgetAll()`.
    The order is the same as before. An owned HeldKeys is revoked in every mode.
  - All three `setTimeout` calls now go through the HeldKeys factories: `createRevealAuthorization`,
    `unlockSession` and `createSessionRevealAuthorization`. Delays and `unref` are unchanged.
    `unlockSession`'s timer no longer captures `input`, which carries `authorizationPassword`, or the service.
- Item 4, follow-up across services:
  - `unlockedSessionFor`, `createSessionRevealAuthorization` and `revealKeyWithAuthorization` read
    only the HeldKeys plus the store, which reloads from the repository.
  - The `keyUpdatedAtMs` check and `openRecordWithKey` need no derivation. The test checks this with
    a derive probe whose count stays at 0.
  - `SealUpgrades` and `CredentialChanges` take the injected HeldKeys through the constructor.
    Neither keeps its own custody.
- The `setTimeout` in `credential-changes.ts:96` (not mine) captures the `CredentialChanges` and
  `changeId`. It does not capture the service or a password. `forgetAll()` clears it in both
  close modes.

## Tests (new `runtime/tests/held-keys-eviction.test.ts`)

- An owned HeldKeys: "revokes and zeroes every held key on close (default | shutdown | evict)".
- An injected HeldKeys:
  - "leaves the unlocks and reveal authorizations in place on evict"
  - "revokes and zeroes them on shutdown (default | shutdown)"
  - "lets a new service over the same repository release the surviving unlock without a re-unlock".
    This covers `unlockedSessionFor`, the session reveal path, an authorization created before
    eviction claimed through the new service, and zero derivations.
  - "revokes the surviving unlock's key when the new service rotates it"
  - "still expires the unlock and its authorizations after the creating service is evicted" (fake timers)
- Expiry timers:
  - "do not keep the service or a password-carrying input alive while they are pending"
  - "do not keep a password-carrying input alive for a service that owns its keys and is never closed"

How the password check works: it is behavioural. The test takes a `WeakRef` to the service, to the
`unlockSession` input object and to the `createRevealAuthorization` input object, while the
12-hour and 5-minute real timers are still pending. It then forces GC with
`v8.setFlagsFromString("--expose-gc")` + `vm.runInNewContext("gc")` (yielding with `setImmediate`
before each round, up to 10 rounds) and asserts all of them are collected. A string cannot be
held by a `WeakRef`, so the object that carries the password stands in for it.

I checked that this test detects the leak. On the unmodified code, the owned-service variant
failed (`expected false to be true`), because the timer kept `input` reachable. It passed after
the change. The file passed 5 out of 5 repeated runs.

## Commands run and observed results

- Before the change: `node ../../scripts/vitest-groups.mjs --groups=parallel src/programs/secret-keys/runtime/tests/held-keys-eviction.test.ts`
  -> `Tests 5 failed | 6 passed (11)`. The failures were the 3 injected-HeldKeys cases and the 2
  GC cases, as expected.
- `cd packages/fluxiq && node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql src/programs/secret-keys`
  -> parallel `Test Files 11 passed (11)`, `Tests 67 passed (67)`; real-sql `Test Files 1 passed (1)`,
  `Tests 17 passed (17)`; `[vitest-groups] all groups passed: parallel, real-sql`.
- The eviction test file 5 times -> `Tests 11 passed (11)` each time.
- tsc under `heavy-check.lock` -> exit 2 with one error:
  `src/framework/index.ts(212,43): error TS2339: Property 'closeAll' does not exist on type 'ProgramStateConnections'.`
  The other worker is editing `programs/_shared/state-connections.ts`. There were no errors in secret-keys files.

## Not verified

- Wiring through `_shared/runtime.ts` and `framework/index.ts`, and the workspace manager, were
  outside this brief.
- The full Core suite was not run; per the twice-a-day rule, only the secret-keys directory ran.
- A clean tsc is not proven, because of the other worker's error above.

## Open questions / for the supervisor

- **Export needed:** `HeldKeys` is not reachable from `secret-keys/index.ts`. `export *` from
  `service.ts` already carries `SecretKeysCloseMode`. Add `export { HeldKeys } from "./runtime/held-keys.ts";`
  to `secret-keys/index.ts`, plus framework re-exports if the manager lives outside the package.
- **Wiring:** `framework/index.ts:209` calls `secretKeys.close()`. Eviction must pass `{ mode: "evict" }`,
  and shutdown or workspace deletion keeps the default. The manager must call `heldKeys.revokeAll()`
  itself when it drops a workspace for good, because nothing else zeroes an injected HeldKeys.
- **In-flight work in an evicted service is not cancelled, same as before.**
  - An `unlockSession` or seal upgrade still deriving in the old service can finish and write into
    the shared HeldKeys after eviction.
  - If the new service rotated the key in between, the old service may hold a stale key under the
    old `keyUpdatedAtMs`. The new service refuses to release it ("unavailable"), so it fails closed.
  - Evict only idle instances, as the plan already says.
