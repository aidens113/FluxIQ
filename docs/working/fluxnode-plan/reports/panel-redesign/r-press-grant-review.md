# P9-R: adversarial review of the press grant

Worker report, 2026-11-09. I reviewed the code first and read the author's report (f1-press-grant.md) afterwards.

## Outcome

Done. The press grant mostly holds. I found two gaps where IAM and the handler could act on something the grant did not cover. I fixed both, each with a test that fails before the fix and passes after. Both are **Low** severity: they can be reached only by server code that builds a payload JavaScript can express and JSON cannot, such as an inherited field, an `undefined` field, a `toJSON` or a getter. An HTTP body cannot do that, and neither can the assistant's tool arguments, because those are parsed from JSON. Nothing is broken and left unfixed in my paths. Four recommendations for files outside my paths are listed at the end.

## What changed and why

**Gap 1: the grant bound one reading of the payload, but IAM and the handler read another (broken, then fixed).**
- What was wrong:
  - `pressGrantPayloadDigest` hashes the payload as JSON would send it.
  - `call()`, on the other hand, gave `decideCall` (through `resource.of`) and the handler the live object.
- The attack: a grant minted for `{flowId}`, used with `Object.create({projectId: "project.victim"})` plus `flowId`.
  - The digest matched.
  - IAM decided on `project/project.victim`, and the handler read `projectId: "project.victim"`.
  - The same happened with an `undefined` own key (it overrides a handler's spread default) and with a `toJSON`.
  - The failing run printed: `expected 'frn:fluxiq:studio:workspace-main:proj…' not to contain 'project.victim'`.
  - The server-side `mintPressGrant` had the same problem: its IAM check read `resource.of(input.payload)`.
- The fix:
  - New `press-grant/payload/as-sent.ts` (`payloadAsSent`). It is now the only way a destructive payload is read: the digest uses it, and so do `call()` and `mintPressGrant`.
  - A destructive call that a press grant confirms is now decided, confirmed and handled on the payload as sent.
  - Over HTTP this changes nothing, because the body is JSON already.
  - A payload that JSON cannot write (a cycle, a BigInt) gets the refusal "The action's details could not be read." before any IAM decision.
- Why PIN calls are left alone:
  - A PIN binds no payload, so a call carrying one is read exactly as before.
  - The IAM parity and escalation fixtures (`idsPayload`, a Proxy) depend on that: my first, unscoped version failed `api-iam-parity` and `api-iam-escalation`.

**Gap 2: whether a call carries a PIN was read twice (found in my own fix, then fixed).**
- What was wrong:
  - `call()` checked for a PIN to choose how to read the payload.
  - `confirmDestructiveCall` then checked again.
  - A getter that returns a PIN on the first read and `""` afterwards therefore took the PIN path in `call()` (raw payload into IAM) and the grant path in the confirmation.
- The failing run showed the handler running: `expected true to be false`.
- The fix:
  - New `press-grant/payload/carries-pin.ts` (`payloadCarriesPin`).
  - `call()` reads it once and passes `carriesPin` to `confirmDestructiveCall`, which no longer reads the PIN itself to choose a path.
  - An assistant call with `carriesPin` is refused, as before.

**Placement.** The structure audit refused three files sharing the `payload-` prefix. They now live in `press-grant/payload/`:
- `as-sent.ts`, `carries-pin.ts` and `digest.ts`, with a barrel;
- the author's `payload-digest.test.ts` moved to `payload/tests/digest.test.ts`.

**Files changed:**
- `packages/fluxiq/src/programs/_shared/api.ts`;
- `press-grant/confirm-destructive-call.ts`, `press-grant/index.ts` and `press-grant/press-grant-store.ts` (import only);
- new `press-grant/payload/{as-sent,carries-pin,digest,index}.ts` (`digest.ts` is the moved `payload-digest.ts`);
- `payload/tests/digest.test.ts` (moved);
- new `press-grant/tests/press-grant-attacks.test.ts` (17 tests).

## Each attack

| Attack | Verdict | Evidence |
|---|---|---|
| Digest: undefined vs missing keys, key order at any depth | Held | Unit tests. Over HTTP, the digest and the handler read alike. For server code, Gap 1 is now fixed. |
| Digest: nested arrays (order, depth, `[]` vs `{}`) | Held | Unit test |
| Digest: Unicode (NFC vs NFD in keys and values, lone surrogates vs U+FFFD) | Held, strictly | Different forms digest differently. The handler also sees different strings, so the only cost is a false refusal. |
| Digest: 1 vs 1.0 vs 1e0 | Held | They are one JavaScript number, so the handler cannot tell them apart either. `1` vs `"1"` differ. |
| Digest: `__proto__` | Held | `JSON.parse` makes it an own key. The digest counts it, independent of key order, and never treats it as a prototype. An *inherited* field was Gap 1 (fixed). |
| Digest: only the carriers `authSessionId` and `pressGrant` dropped, top level only | Held | `via`, `authorizationPin: ""` and a nested `pressGrant` all change the digest. |
| Two (twelve) concurrent consumes of one grant | Held | Exactly one call ran. The other eleven got "Press Allow again". `consume` deletes synchronously. |
| Grant used after sign-out / in the person's next session | Held | Refused with signIn and with pressAgain respectively. |
| `via` set or omitted by an HTTP caller | Held | `handleProgramRequest` (server/program-route) builds the call from fixed fields and never copies `via` or `pressGrant` from the body. A body cannot remove a `via` that server code set: the test shows the assistant's mint is refused whatever the body says. |
| Smuggled `pressGrant`, `authorizationPin` or `via` in a payload | Held | An assistant payload carrying `pressGrant: ""`, `pressGrant: null` or `authorizationPin: ""` is refused. A person's payload `via` is just part of the act (it changes the digest). A mint body's `authorizationPin` or `pressGrant` has no effect. |
| The mint's IAM check evaluating a different resource than the call | Broken, now fixed (Gap 1) | Before the fix this was possible only through server code. Over HTTP the resource came from the same JSON. Now the mint and the call read the same `payloadAsSent`, and `resource.of` is a pure function of the payload (`endpoint-resource.ts`). |
| Minting for an endpoint the person may not call; probing | Held | A local viewer and a service read-only member are both refused. A service `user` member (`FluxIQUserAccess`) can mint only for their own project. A grant for their own project, presented with another person's project, is refused by IAM first and the grant stays unspent. A mint reveals nothing a direct call does not (allow, deny and not-found are all visible through `call()` already). |
| Timing of comparisons | Held | The map is keyed by SHA-256 of the presented grant, the binding is compared with `timingSafeEqual` on 32-byte digests, and the shape regex is linear. |
| Store memory (expired grants) | Held | 200 sessions × 16 grants = 3200 held, and after 60 s one mint sweeps them back to 1. At most 16 unused grants per session. The total is bounded by live sessions. |
| Hosted `service` roles | Held | `user` gets `iam:MintPressGrant` from the SelfService statement on its own user, and IAM still decides the target with an owner condition. `viewer` (ReadOnly, which lists `iam:MintPressGrant` from the generated read-only list) reaches the mint but is refused on the target. Admin is unaffected. Paired clients are refused by channel. |
| Cross-site / framed | Held (by reading the code, no browser test) | `isCrossSiteRequest` refuses a cookie-bearing POST unless `Sec-Fetch-Site` is same-origin or none, and refuses a mismatched Origin. No CORS headers exist, so a cross-origin page cannot read a mint's answer. `next.config.ts` sends `frame-ancestors 'none'` and `X-Frame-Options: DENY` on `/:path*`. The panel's only iframe is a `srcDoc` docs frame, which these headers do not affect. The headless listener reads no cookie. |
| A person with a PIN still needs it | Held | `pinConfigured` comes from `withCredentialStatus` (the held credential or the sealed metadata). A person with no PIN who sends a PIN is refused by `authorizeSessionPin`. |
| Non-destructive behaviour unchanged | Held | The as-sent reading applies to destructive calls only, and not to PIN calls. Nothing in the repository uses a `pressGrant` field except this module. |
| Grant in logs, audit rows, errors or responses | Held | Audit rows hold FRNs built from payload ids, never the payload. Refusals are fixed sentences. Performance metrics record byte counts only. The handler never receives the grant. |

### The author's threat list, checked

- T1 to T14 and T16 match what I found.
- T3 claimed "two payloads a handler would read alike digest alike". That was true only for JSON payloads; Gap 1 is the exception, now fixed.
- T9 holds, now on one reading of the payload.
- T7's claim that "`FluxIQBrowserSession` denies `iam:*`" was not checked. It is not needed, because the channel check refuses paired clients first.
- T15 (one process per store) is a usability issue for hosted deployments with several processes, not a security hole.

## Commands run and observed results

- Before each fix, `npx vitest run src/programs/_shared/press-grant/tests/press-grant-attacks.test.ts`:
  - Gap 1: `1 failed | 14 passed`, `not to contain 'project.victim'`;
  - mint side, with the fix reverted temporarily: `1 failed`, same message;
  - Gap 2, with the fix reverted temporarily: `1 failed`, `expected true to be false`.
- After the fixes, `npx vitest run src/programs/_shared/press-grant` -> `Test Files 4 passed (4)`, `Tests 46 passed (46)`.
- `npx vitest run src/programs/_shared/press-grant src/programs/_shared/tests/api-iam-escalation.test.ts src/programs/_shared/tests/api-iam-parity.test.ts src/programs/_shared/tests/api.test.ts` -> `Test Files 7 passed (7)`, `Tests 61 passed (61)`.
- `npx vitest run src/programs/_shared src/platform/iam --pool=forks --poolOptions.forks.singleFork=true` -> `Tests 4 failed | 496 passed (500)`.
  - All four failures are generated-file drift from endpoints another worker registered during my run: `live-registry` (`read-only-actions.generated.ts drifted`, `actions.generated.ts drifted`), `live-role-parity` (viewer mismatches on `studio:ListPanelThreads`, `studio:GetPanelThread` and `studio:GetPanelAssistantAllowance`), and `assistant-tools.generated.ts drifted`.
  - My earlier full run, before those endpoints existed, had none of these failures.
- `node scripts/structure-audit.mjs` -> `structure-audit: 1 violation(s)`: `assistant-tools.generated.ts: 4705 lines exceeds the 800-line limit`, which is not my file. My `naming` violation is fixed.
- fluxiq typecheck, with the lock taken and released (4002 MB free) -> `tsc exit 2` with two errors, both in other workers' files:
  - `automation-studio/api/panel-assistant/tests/register.test.ts(48,77)`: `"flows.read"` is not a `Permission`;
  - `runtime/conversations/assistant/tests/panel-assistant.test.ts(38,37)`: `PanelAssistantTarget`.
  - My own import error from the first typecheck is fixed.

## Not verified

- Live browser behaviour: no panel page mints yet, so cross-site, framing and SameSite were checked by reading the code only.
- The web typecheck, and the route tests in `server/program-route` (never-touch).
- `src/platform/iam` and `src/programs/_shared` after the supervisor regenerates the catalogs.

## Open questions and recommendations (outside my paths)

1. **Regenerate** (supervisor): `FLUXIQ_REGENERATE_IAM_CATALOG=1 pnpm exec vitest run src/platform/iam/catalog` and `FLUXIQ_REGENERATE_ASSISTANT_TOOLS=1 pnpm exec vitest run src/programs/_shared/assistant`, in `packages/fluxiq`.
2. **Enforce `assistant.hidden` in the registry** (Low; defence in depth for the assistant loop).
   - Today `call()` does not stop a `via: "assistant"` call to an endpoint declared `{ hidden }`, such as `execute-client-action`, which runs raw commands in a connected browser. The loop is trusted to offer only visible tools.
   - It would still need the person's press, but the confirm card would describe an act the assistant should never propose.
   - Suggested change in `GlobalProgramApiRegistry.call`, after the actor check:
     `if (request.via === "assistant" && registration.assistant !== undefined && "hidden" in registration.assistant) return { ok: false, error: registration.assistant.hidden, errorCode: "authorization.forbidden" };`
   - I left it out because brief A and the conversations worker own the assistant contract; adding it would change their path without them.
3. **For the conversations worker:**
   - Every tool call it makes must set `via: "assistant"`. A missing `via` means "the person".
   - `mintPressGrant` may be called only while handling the person's own HTTP press on the confirm card, with that request's actor.
   - It must mint and call with the very payload the card showed.
   - It must pass that payload as plain JSON data. Since this review, anything else is read as sent, so a field the card did not show cannot act.
4. **Low notes:**
   - The store tells time with `Date.now`. A system clock set back would lengthen a grant's life. Suggested: default `now` to `() => performance.timeOrigin + performance.now()` (monotonic).
   - The grant is not bound to `scope.domainId`. Today every destructive handler takes its target from the payload and uses scope only as a domain guard, so binding scope is not needed. If a destructive handler ever chooses its target from scope, add scope to `bindingDigest`.
   - A mint writes an "allow" audit row for the target action at press time, so one delete shows two rows. A reader of the audit log should know this.
   - A press grant does not protect against script running on the panel's own origin. `docs.tsx` renders documentation through `dangerouslySetInnerHTML`, and XSS there would mint and delete. It is worth a separate review.
