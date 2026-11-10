# P9-F1: a press grant replaces the PIN on destructive endpoints

Worker report, 2026-11-09. Security change; for the adversarial reviewer.

## Outcome

Done in my paths. Three tests outside my paths now fail only because generated files I may not touch must be regenerated for the one new endpoint (commands below). The `assistant-tools.generated.ts` drift was already there before my change.

## What changed and why

**New module `packages/fluxiq/src/programs/_shared/press-grant/`** (one export per file, barrel `index.ts`):

- `press-grant-store.ts`: `PressGrantStore`.
  - `mint({ sessionId, actorId, programId, endpoint, payload }) -> { grant, expiresAt }`: the grant is 32 bytes from `crypto.randomBytes`, sent as base64url (43 characters), and lasts 60 s. The clock can be injected.
  - `consume(grant, binding) -> boolean`. It is synchronous: the grant is looked up by its SHA-256 and deleted before anything is checked, so it is spent even if the binding is wrong, it has expired, or the handler then fails. The binding digest is compared with `timingSafeEqual`.
  - Only SHA-256 digests are stored, never the grant and never the raw session id.
  - A session can hold at most 16 unused grants. Past that, its oldest is dropped. See threat T14.
- `payload-digest.ts`: `pressGrantPayloadDigest`. It works on the payload as JSON would send it (a missing payload counts as `{}`, an `undefined` field as absent), drops the top-level `authSessionId` (which the route adds) and `pressGrant`, sorts keys at every depth, and takes the SHA-256 of the result.
- `confirm-destructive-call.ts`: `confirmDestructiveCall`. `call()` runs it for `destructive` endpoints after IAM allows the call. The order is:
  1. A `via: "assistant"` payload that carries `pressGrant` or `authorizationPin` is refused.
  2. A payload that carries a PIN goes through the PIN check, unchanged.
  3. Otherwise the actor's own session must be live (`identityAccess.validateSession(actor.sessionId)`, and the user must be the actor).
  4. If the person has `pinConfigured`, the call is refused with "PIN is required for this action". A grant never stands in for a PIN.
  5. Otherwise the call needs a grant, from `request.pressGrant` (server code) or `payload.pressGrant` (a panel page, never the assistant). With none: "Press Allow to confirm this."
  6. If the grant is spent or its binding fails, or `payload.authSessionId` is not the actor's session: "That confirmation was used already, ran out, or was for something else. Press Allow again."
- `person-press-refusal.ts`: who may mint.
  - Refused: any `via`, no actor, any channel other than `panel`, a session that is not live or not the actor's, and a person who turned a PIN on.
  - Channels are allowed by name, so a new channel such as P3b keys is refused by default.
- `register-press-grant-api.ts`: `registerPressGrantApi(registry)` registers `identity-access/mint-press-grant`. Its declaration:
  - `program-gated`, `programs.read`, `iam:MintPressGrant`, `Write`, `endpointResource.selfUser()`;
  - `assistant: { hidden: "Only a person's own press can confirm an action." }`.
  - Body: `{ programId, endpoint, payload }`.
- `mint-endpoint.ts` (`PRESS_GRANT_MINT_ENDPOINT`), `refusals.ts` (the plain refusal sentences), `types.ts`.

**`programs/_shared/api.ts`:**

- `ProgramApiRequest` gains `via?: "assistant"` and `pressGrant?: string`.
- The constructor takes an optional `pressGrants` store.
- In `call()`, `authorizeProgramPin` is replaced by `confirmDestructiveCall`. The handler (and `afterSuccess`) gets the request without `pressGrant`, on the request and in its payload, for every classification.
- `decideCall` passes `request.via` to the IAM gate.
- New `mintPressGrant(input)`: the server-side mint that a later brief calls when the person presses Allow on the assistant's card, with that request's actor and no `via`. It:
  - checks the person;
  - checks that the target is `destructive`;
  - runs the target's own IAM decision (`this.authorize` with the target's action, permission and resources from the payload);
  - only then calls `pressGrants.mint`.
- The class doc for `destructive` is updated.

**`via` in the audit.** I had to touch three files beyond `platform/iam/audit` to carry it:

- `platform/iam/types.ts`: new `IamRequestVia`; `IamRequestContext.via?` and `IamAuditRecord.via?`;
- `platform/iam/authorize/record-decision.ts`: writes `via` when it is present;
- `programs/_shared/iam/program-iam-gate.ts`: `open(..., via?)`.

`platform/iam/audit/store.ts` stores `via` with no schema change: it is interned in the origin's dictionary value as `origin` + U+001F + `via`, so older rows read back unchanged.

**Registration.** `programs/_shared/runtime.ts` gets the import and one line, `registerPressGrantApi(api);`, after `registerIdentityAccessApi`.

**Tests.**

- New, in `press-grant/tests/`:
  - `press-grant-store.test.ts` (10 tests);
  - `payload-digest.test.ts` (5 tests);
  - `registry-press-grant.test.ts` (14 tests, using the real `IdentityAccessService`; only the clock and the handlers are stubbed).
- `platform/iam/audit/tests/store.test.ts`: one test added for the `via` round trip.
- `programs/_shared/tests/api.test.ts`: in "refuses a destructive endpoint that carries no PIN", the stub now says the person turned a PIN on, and the test is renamed. The assertion is unchanged.
- `automation-studio/api/handlers/tests/datasets.test.ts`: the stub gains `validateSession`, saying the writer turned a PIN on. The assertions are unchanged. This test file is outside my listed paths, but brief item 4 covers it.

The web route needs no change: `handleProgramRequest` already puts the raw cookie session in `actor.sessionId` with `channel: "panel"`, and a body cannot set `via` or `request.pressGrant`.

## Commands run and observed results

- `npx vitest run src/programs/_shared/press-grant` -> `Test Files 3 passed (3)`, `Tests 29 passed (29)`.
- `npx vitest run src/programs/_shared/press-grant src/programs/_shared/tests src/platform/iam/audit src/programs/automation-studio/api/handlers/tests/datasets.test.ts` -> `Test Files 22 passed (22)`, `Tests 146 passed (146)`.
- `npx vitest run src/programs/_shared` before my test edits -> 2 failed / 211 passed:
  - `api.test.ts`, the expected behaviour change, since fixed;
  - `assistant/tests/generated-module.test.ts`: `assistant-tools.generated.ts drifted`. The file on disk holds `"tools": [], "hidden": []`, so it was already behind the live registry before my change.
- A run over Studio handler tests (flows, projects, subflows, domain-scope, panel-command-pin, the assistant tests), the bootstrap tests, `programs/tests/global-identity-access.test.ts`, `programs/identity-access`, `platform/iam` and the two `runtime/conversations/instructions` tests -> 4 failed / 417 passed:
  - `datasets.test.ts`: fixed, now 10/10;
  - `platform/iam/catalog/tests/live-registry.test.ts`, two tests: `read-only-actions.generated.ts drifted` and `actions.generated.ts drifted`. In both, the only difference is `iam:MintPressGrant`;
  - `platform/iam/parity/tests/live-role-parity.test.ts`: viewer on `iam:MintPressGrant` gets `today: allow, iam: deny`, because `FluxIQReadOnlyAccess` is built from the generated read-only list. Regenerating fixes it.
- A second run of flows, projects, subflows, both bootstrap tests, domain-scope and `src/programs/_shared/tests` -> `Test Files 21 passed (21)`, `Tests 113 passed (113)`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (536 warning(s), 1095 baselined).` The first run failed on imports that bypassed the barrel; I fixed them.
- fluxiq typecheck, with 3216 MB free and the lock taken and released: `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check.tsbuildinfo` -> `tsc exit 0`.

**The supervisor must run these** (they write the generated files I may not touch), in `packages/fluxiq`:

- `FLUXIQ_REGENERATE_IAM_CATALOG=1 pnpm exec vitest run src/platform/iam/catalog`
- `FLUXIQ_REGENERATE_ASSISTANT_TOOLS=1 pnpm exec vitest run src/programs/_shared/assistant`

Then re-run `src/platform/iam/parity`.

## Threats considered, and how each is handled

- **T1. Replay.** `consume` deletes before checking, synchronously, so two racing calls cannot both pass. Tested: replay is refused and the handler runs once.
- **T2. Expiry.** A grant lasts 60 s on the injected clock and is refused at `now >= expiresAt`. Tested: accepted at 59 s, refused at 61 s, both in the store and through the registry.
- **T3. Payload substitution.** The grant is bound to the SHA-256 of the canonical payload, so changing any value, key, nesting or array order is refused, while reordering keys is not.
  - Only the top-level `authSessionId` and `pressGrant` are excluded. A nested `authSessionId` still counts.
  - A JSON round trip makes NaN and null the same. Only in-process callers can send NaN.
- **T4. Endpoint or program substitution.** Program and endpoint are bound in the normalised form `call()` looks them up by. Tested: another endpoint and another program are refused, a case-shifted name is accepted.
- **T5. Session or actor substitution.** The grant is bound to a digest of `actor.sessionId` and to `actor.userId`. At consume time the session must still be live and belong to the actor, and a payload `authSessionId` that differs from the actor's session is refused (confused deputy). Tested: another session of the same person, another person, a payload naming another session, and a session revoked after the press are all refused.
- **T6. The assistant approving its own act.**
  - The mint endpoint and `mintPressGrant` refuse any `via`, and the endpoint is `hidden` from the assistant.
  - A `via: "assistant"` call may not carry `pressGrant` or `authorizationPin` in its own payload, so a grant that leaked into a transcript cannot be redeemed by the model. It is confirmed only by `request.pressGrant`, which server code sets after the person's own press.
  - Tested.
  - **Residual risk:** absent `via` counts as "a person". Any future in-process path that calls the registry on a model's behalf must set `via`; the reviewer should check the assistant loop (brief F) does.
  - The existing chat command port and the paired-client route reach only `read`/`authoring`, and the mint endpoint is `program-gated`, so neither can reach it.
- **T7. A paired client or key minting.** Mint requires `channel === "panel"` (allowed by name) and a live identity session belonging to the actor. A paired actor's session `client-gateway:...` never validates. The endpoint is not on the paired allowlist and its class is not `read`/`authoring`. Under `service`, `FluxIQBrowserSession` denies `iam:*`. Tested: a paired client, an actor with no channel, a fake session and a mismatched user are refused.
- **T8. Bypassing a PIN with a press.** If `pinConfigured` (from the held credential, or from metadata while the credential is sealed), mint is refused and a grant is never consumed, even one minted before the PIN was set. Tested. A person with no PIN who sends a PIN falls to `authorizeSessionPin`, which refuses ("PIN is required for this action"), so there is no bypass that way either.
- **T9. Minting for an act the person may not do.** Mint runs the target's IAM decision, with resources from the target payload, and refuses non-destructive or unknown endpoints. `call()` decides IAM again before consuming, and a denied call does not consume the grant. Tested with an actor missing `secrets.manage`.
- **T10. Grant leakage.**
  - Only digests are stored.
  - Refusals are fixed sentences that never name the grant or which binding failed (one sentence for every binding failure).
  - The grant is removed from the request and payload before any handler, so no handler can store, log or echo it. Tested: an authoring handler receives no `pressGrant`, and the audit JSON does not contain the grant.
  - The audit rows hold no payloads. Performance metrics record byte counts only.
  - The mint answer carries the grant to the person's own page, in the body only. The route logs only when a body cannot be serialised, and then logs the error, not the body.
- **T11. Guessing.** 256 bits of entropy. A malformed string is refused before lookup, and the length is bounded by the regex.
- **T12. Timing.** The map key is the SHA-256 of the presented grant, so a key-comparison timing difference tells an attacker nothing about a stored grant. The binding uses `timingSafeEqual` on fixed-length digests.
- **T13. Cross-site minting (CSRF).** The panel middleware's cross-site guard covers cookie-bearing POSTs (`Sec-Fetch-Site` and Origin against Host), and a cross-site page cannot read the mint answer. Under DNS rebinding the cookie (host 127.0.0.1) is not sent, so there is no session and the request is refused.
- **T14. Memory exhaustion by a signed-in script.** Expired grants are dropped on every mint and consume, and a session can hold at most 16 unused grants (the oldest is dropped). This bounds a security store's memory; it does not cap a failure. A person never holds more than one or two.
- **T15. Restart or eviction.** Grants live in one registry's memory, so a restart, a workspace-manager eviction, or a second process yields "Press Allow again". That is safe, and a usability note for hosted multi-process deployments.
- **T16. The handler fails after consumption.** The grant stays spent. Tested.
- **T17. Audit attribution.**
  - `via: "assistant"` is written to every IAM row of the call (allow and deny). Tested in the sink and in the SQLite round trip.
  - **Note:** minting also records one decision row for the target action (the mint-time check), so a confirmed delete has two target rows: one at the press, one at the call.

## Findings for the reviewer and the lead (outside my paths; not changed)

1. **Clickjacking.** I found no `frame-ancestors` or `X-Frame-Options` in `apps/web` (`next.config`, middleware, lib). The session cookie is `SameSite=Lax`, so a cross-site frame is signed out. But another local port (127.0.0.1:other) is the same *site*, so it can frame the panel with the cookie and lure a press on Delete or Allow. Suggested: `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) on panel pages. The value of "a person's own press" depends on it.
2. **The `service` profile.** `FluxIQUserAccess` (`platform/iam/predefined/user-access.ts`) does not allow `iam:MintPressGrant`, so a plain `user` member under `service` cannot press to delete their own data. Exact change: add `"iam:MintPressGrant"` to the `SelfService` statement's `Action` list (its resource `user/${fluxiq:PrincipalId}` matches the endpoint's `selfUser()`). Admin and read-only are covered after regeneration.
3. **No profile-level PIN switch exists.** The only "PIN turned on" signal is the person's own (`pinConfigured`). A profile switch, if wanted, would be a constructor option on the registry; I did not add unused machinery.
4. **PIN-on persons and the assistant.** A `via: "assistant"` call may not carry a PIN in its payload. If brief F wants PIN-on people to confirm assistant acts, it needs a server-side PIN channel such as `request.authorizationPin`, set from the person's own answer.
5. **Docs.** `docs/architecture/automation-studio/persistence.md` and any IAM or panel docs that say "every destructive endpoint requires the PIN" should be updated. That is not my path.
6. **Exports.** `PRESS_GRANT_MINT_ENDPOINT` and the store are reachable through `programs/_shared/press-grant/index.ts`, and `mintPressGrant` is a registry method (`fluxiq.programs.api.mintPressGrant`). `programs/index.ts` does not re-export the press-grant barrel; add `export * from "./_shared/press-grant/index.ts";` if apps/web needs the constant.

## Not verified

- Live browser behaviour: no panel page mints yet. That is a later brief.
- apps/web typecheck and web route tests: not run, since I changed nothing there.
- The full fluxiq vitest run: not run, per the twice-a-day rule.
- The generated catalogs and parity after regeneration: not run, because I may not write those files. I expect regeneration to clear all three failures, since each diff shows only `iam:MintPressGrant`.
- Behaviour under the `service` profile with a `user` role: not exercised (see finding 2).

## Open questions or contradictions found

- The brief owned only "its file under platform/iam/audit" for `via`. Carrying `via` to the row also needed the three small additive edits listed above (types, recorder, gate). I made them; the supervisor should confirm that is acceptable.
- `api.ts` already held brief A's uncommitted assistant changes; mine sit on top of them and do not alter them.
