# t802-W4a: owner claim (setup code replaces admin/admin on public profiles)

## Outcome

Done. `prepareOwnerClaim`, the claim itself, `/setup` and `/setup/submit` are built. The brief's
tests run end to end over a real FluxIQ instance in a temporary root, and 20 of 20 pass. The web
typecheck has no errors in the owned paths. The structure audit has no violations in the owned
paths. It still fails overall on 7 violations in other workers' files (listed below).

## What changed and why

`apps/web/src/server/owner-claim/` (barrel `index.ts`):
- `prepare-owner-claim.ts`: `prepareOwnerClaim({ settings, fluxiqDir }): Promise<{ claimed; codeFile }>`, exact signature.
  - On `local` it does nothing and returns `codeFile: null`, so today's admin/admin first start is unchanged.
  - If claimed, it removes a leftover generated code file.
  - With `FLUXIQ_SETUP_CODE_FILE` set, the code is the file's trimmed content. It throws if the file is unreadable or under 16 characters. The message names the setting, never the content.
  - Otherwise it writes `<fluxiq>/security/setup-code`: 20 bytes (160 bits) from `node:crypto` as 40 hex characters, mode 0600, through a temp file and a rename. The file is kept across restarts while it holds a usable code.
- `read/`:
  - `readOwnerClaimMarker`: only ENOENT means unclaimed. A damaged marker still counts as claimed.
  - `readConfiguredSetupCode`: throws when unusable.
  - `readGeneratedSetupCode`: ENOENT or a short file gives null; any other error is thrown.
  - `readSetupCode`: the code the submit accepts. A bad configured file throws, so the submit fails closed with a 500 rather than reading it as "no code".
- `setup-code-matches.ts`: compares the SHA-256 digests of the trimmed typed code and the expected code with `timingSafeEqual`.
- `claim-owner.ts`: one claim at a time per process (a promise queue), and the marker is re-read inside the queue. Steps in order:
  1. `platform.provisioning.run("createAccount", …)` with caller `{ kind: "in-process", actorUserId: null, transport: "in-process" }`. This is the only caller `checkProvisioningPolicies` lets attach `FluxIQOwnerFullAccess`: single tenancy, never over HTTP; the website's `provisionerCaller` is HTTP and is refused. The call passes `policies: ["FluxIQOwnerFullAccess"]` and `workspace: "new"` (the one workspace under single tenancy) with a fixed `requestId: "owner-claim"`, so a retry after an interruption replays the same account instead of making a second one.
  2. `setPassword` (in-process), so a replayed account takes this attempt's password.
  3. `retireDefaultAdmin`, covered next.
  4. Write the marker `{ schemaVersion, claimedAt, ownerUserId }` (mode 0600, no secrets).
  5. Delete the generated code file. The operator's file is never touched.

  The marker is written after the admin is retired, so a failure part-way leaves the claim open to retry rather than claimed with admin/admin still live. Provisioning errors map to `invalid_input` (with form field names), `weak_password`, `username_taken`, `claim_incomplete` (a `request_conflict`) and `claim_failed`.
- `retire-default-admin.ts`: if the `admin` account still signs in with `admin`/`admin`, it is deleted (the probe session is revoked first). The owner is an enabled administrator, so the last-administrator rule allows this. If its password was changed (someone used it), it is disabled instead of deleted, which keeps its credential and sealed keys for the owner to re-enable. Its sessions are revoked either way. Only the `identity.last_administrator` error falls through; any other error is thrown.
- `is-owner-claim-open.ts`, `owner-claim-paths.ts`, `write-private-file.ts`, `setup-code-minimum-length.ts`, `types.ts`.

`apps/web/src/app/setup/`:
- `page.tsx`: `notFound()` on `local` or once claimed (`force-dynamic`). It renders `SetupClient` inside welcome's `AccountLinkFrame`.
- `SetupClient.tsx`: the form, with fields setup code, email (the username), display name, password and confirmation.
- `client/`: `postSetup`, `setupMessage`, `SetupAnswer`.
- `submit/route.ts`: answers 404 on `local` before composing the platform services. Otherwise it passes `getFluxIQ()` programs, `getPlatformServices().provisioning` and `setupAttempts(fluxiqDir)`.
- `server/submitOwnerClaim.ts`, in order:
  1. 404 on `local` or once claimed, before the body is read.
  2. Read the form: same-site, at most 8 KiB, five non-empty strings.
  3. Throttle with `DurableLoginAttemptTracker`. Only wrong codes count. The global key `setup` allows 10 per 10 minutes and locks for 10 minutes. With `FLUXIQ_TRUST_PROXY` there is also a per-address count of 5, keyed by `resolveClientAddress` on `X-Forwarded-For`. The counters live in `<fluxiq>/security/setup-attempts.json` and `setup-address-attempts.json`.
  4. Answers: 503 if no code exists, 401 for a wrong code, 400 for a mismatched confirmation.
  5. Claim, then sign in: `identityAccess.authenticate` gives the session; `secretKeys.unlockSession` runs on it, and the session is revoked if that fails, as the login route does. Then `recordSignIn`.
  6. Answer `{ ok: true, redirectTo: "/" }` with a session.
- `server/toSetupHttp.ts`: the cookie uses `FLUXIQ_SESSION_COOKIE` and `sessionCookieOptions(maxAgeSeconds)` from `lib/session-cookie`. That module exists now and typechecks.
- No answer or log line contains the code or the password. Answers carry only codes, field names and `retryAfterMs`; log lines carry outcome words and error names.
- The form's username must be an email, because `createAccount` takes `email` and identity uses it as the username. The page labels it "Email address (your username)".

Point 3 (tenancy): under `service` the plan has the owner administer the platform root, not a tenant workspace. Tenancy is lane C, and `getPlatformServices()` composes `tenancy: { mode: "single", workspaceId: FLUXIQ_WORKSPACE_ID || "workspace-main" }` on every profile. So for now the owner is claimed into that single workspace with `FluxIQOwnerFullAccess`, on `service` as on `self-hosted`. When lane C turns `service` into multi tenancy, `checkProvisioningPolicies` will refuse `FluxIQOwnerFullAccess` there (`forbidden_policy`), and the claim then needs a platform-root path (see Open questions).

## Commands run and observed results

- From apps/web, in the lock, `pnpm exec vitest run src/server/owner-claim src/app/setup`, final run:
  `Test Files  4 passed (4)` / `Tests  20 passed (20)`.
  - `submitOwnerClaim.test.ts` (7):
    - Happy path end to end: 200, `{ ok: true, redirectTo: "/" }`, the session validates as the owner (roleId admin), membership policies are `["FluxIQOwnerFullAccess"]` in `workspace-main`, `lastSignInAt` is stamped, admin/admin is refused, a second submit gets 404, and the generated file is gone.
    - Wrong code: 10 times 401, then 429 even for the right code, with a `retry-after` header.
    - Per-address throttle behind a trusted proxy: the locked address gets 429 and another address gets 200.
    - `local` gives 404, even for a malformed body.
    - Claimed gives 404.
    - `FLUXIQ_SETUP_CODE_FILE` is honoured (the generated code is refused) and the operator's file is kept.
    - Mismatch, missing fields, a non-email username, cross-site and a weak password are all refused.
    - Every test that handles a secret asserts that neither the code nor the password appears in any answer body or header, in the claim's log lines, or in any console line.
  - `claim-owner.test.ts` (5): the owner and its policy; the untouched admin deleted; a changed-password admin disabled; a weak password refused before any change, with the retry succeeding; a non-email username naming only the field; two concurrent claims making one owner.
  - `prepare-owner-claim.test.ts` (6): a 40-hex code, mode 0600 (checked off Windows only), stable across calls; the setting honoured with no generated file; short or missing files refused without echoing the content; `local` is a no-op; claimed removes the leftover file; `setupCodeMatches`.
  - `postSetup.test.ts` (2).
  - An earlier run failed 1 test because the test itself was missing a `mkdir`. It was fixed and the run above is clean.
- In the lock, `pnpm exec tsc --noEmit` exited 2 with 6 errors, none in the owned paths:
  - `src/lib/fluxiq.ts(375,25)` TS2322: `DrainableGateway.beginDrain` reason type.
  - `src/server/client-gateway-websocket/origin-grammar.ts(10-13)` TS2305: `fluxiq/platform/profile` has no `admitClientGatewayOrigin`, `clientGatewayOriginStartRefusal`, `isPublicClientGatewayBind` or `parseClientGatewayOriginAllowlist`. These look like a Core dist behind its source, or another worker in progress.
  - `src/server/client-gateway-websocket/origin-policy.ts(32,33)` TS7006.
- Core `node scripts/structure-audit.mjs` (`pnpm structure:check`): `structure-audit: 7 violation(s) across 4 rule(s)`, none in the owned paths:
  - `app/reset/request/route.ts` failure-as-empty.
  - `app/api/discovery/*` and `middleware.ts` imports into `lib/request-guard/platform-contracts`.
  - package-exports in `app/api/discovery/tests/discovery.test.ts` and `lib/request-guard/platform-contracts.ts`.
  - statement-packing in `server/client-gateway-websocket/tests/raw-websocket-client.ts`.

  My first audit run flagged 5 violations in my files (failure-as-empty in `claim-owner.ts` and `read-setup-code.ts`, the `read-` naming prefix, and a swallowed catch in `retire-default-admin.ts`). All were fixed before the final runs.

## Not verified

- `page.tsx` and `submit/route.ts` were not run under Next. There is no live server or browser test, and the 404 page path and the cookie on a real response are unexercised. The page logic is covered through `isOwnerClaimOpen`, which the tests exercise.
- `lib/fluxiq.ts` does not call `prepareOwnerClaim` yet (I may not touch it). Until it does, no generated code exists, and a public profile without `FLUXIQ_SETUP_CODE_FILE` answers `setup_unavailable` (503).
- The 0600 file mode is advisory on Windows. It is asserted only off Windows, and was not exercised here.
- A request with `X-Forwarded-For` but no `FLUXIQ_TRUST_PROXY` is not tested separately. The code uses no per-address key then.

## Open questions or contradictions found

1. **`service` and the platform root.** The plan says the claimed owner administers the platform root, but `FluxIQOwnerFullAccess` is refused outside single tenancy. Lane C needs either an owner path at the platform level (packages/platform, outside this brief) or a decision that `service` keeps one platform workspace for its owner.
2. **The owner's email is unverified** (`emailVerifiedAtMs: null`). There is no in-process "mark verified" operation. Under `service` a verified email will be required before connecting or building, so the owner claim needs one, or the welcome flow (packages/platform change).
3. **The username must be an email** because of the contract (`createAccount.email`). Self-hosters who expect a plain username cannot use one.
4. **The global throttle is a shared bucket.** Anyone who can reach `/setup` can keep it locked for 10 minutes at a time, though they can never guess a 160-bit code. Behind a trusted proxy the per-address count limits how often one address can trip it, but not many addresses.
5. **`lib/fluxiq.ts` wiring** (supervisor or another worker): call `prepareOwnerClaim({ settings, fluxiqDir })` at start on non-local profiles, log `codeFile` only, and let a thrown short or unreadable `FLUXIQ_SETUP_CODE_FILE` stop the start.
