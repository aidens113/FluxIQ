# A person's model key stops locking in normal use (t865)

## Outcome

Done as you scoped it, with one thing to know: **the hard rule is not met above a model call
yet.** A locked key waits without failing and resumes, but the limits above that call read a
wall clock, so a wait of hours can still end the task there. They are outside my paths, so I
traced them and list each below for the Exploration lane, with the clock they need ready and
tested.

**The unlock now lasts as long as the paired browser's credential, and that credential now
lasts as long as the browser is in use.** A Core restart or a session ending no longer locks
a paired browser, with no password and no prompt. A browser in regular use never pairs again.
A rotated credential that never arrives no longer strands it. Each listed lock event still
locks, immediately and for that browser.

Nothing has been tried in a real browser: the brief rules that out, and the wire is proved
only by tests against the real gateway, identity and key services on disk.

## The lead's second-round decisions, and what was done

1. **`model_key_locked`** is now a closed wait reason: contract, parser test, the
   ui-components port's restatement (its type test holds them equal), and a fixture
   outcome. A locked key waits under it.
2. **Rotating** keeps the re-wrap, and the threat model says so plainly.
3. **Sign-out elsewhere** keeps its choice, and the setup step now says why it locked:
   "Your model key locked on this browser because you signed out of FluxIQ." Each lock
   stores its reason.
4. **No monthly re-pairing.** No design change was needed beyond what this section lists;
   see "A paired credential's life" below.
5. **`secretsLockedMessage`** now reads "Unlock your model key: open <host> and enter your
   password once", with `secrets.locked` kept as the code and the contract test updated. Every
   other sentence reads from one source, `modelKeyLockedWords`, and tests hold them to it.
6. **The first start** is a setup step and never a failure, in its own words: "FluxIQ now keeps
   your model key unlocked on this browser, and needs your password once to set that up." See
   the note under the table for exactly what "once" means here.
7. **Clocks above a model call:** traced, and listed below. None is in my paths.

## What changed and why

### The design, and where it differs from the brief

The lead's design was a wrap of the data keys under a key derived from the credential.
I kept its properties and changed one thing: **each holder has an X25519 key pair.** The
data keys are boxed to the public key, and only the private key is wrapped under the
credential. Why:

- A purely symmetric wrap can only be written while the credential is in hand. Core has
  the credential only for the moment a browser speaks. So a key added or rotated in the
  panel while the browser is away, and a password change, could not reach it. Pairing
  first and adding a key afterwards is the usual first-run order, so that browser would
  have locked at once, which is the complaint.
- The credential rotates on every reconnect. Re-wrapping one private key is one write;
  re-encrypting every data key is many, and a crash part-way loses them. Rotation is
  now written ahead: the new wrap sits beside the old before the new digest is stored.
- The store still opens nothing alone: a public key opens nothing.

Cost: a person who can **write** the store can box a value of their own to a holder (see
the threat model). That person can also already add a trusted client to the store.

### Second change from the brief: an ordinary sign-in does not lift a lock

If any sign-in re-boxed every browser, signing in at home would unlock a browser the
person signed out of on a shared computer. So only an explicit unlock lifts a lock: the
panel's Secret Keys page names the locked browsers and asks for the password once.

### Keys and custody

- `programs/secret-keys/runtime/unlocks/crypto.ts` (new): the cryptography
  and nothing else. HKDF-SHA256 from the credential, AES-256-GCM, X25519. A wrap is bound
  to holder and person, a box to holder, person and record, by both derivation and AAD.
- `programs/secret-keys/runtime/unlocks/credential-unlocks.ts` (new): the stored records
  and every event on them, reached as `SecretKeysService.credentialUnlocks`. Stored in its
  own repository, `secret.credential-unlocks`, registered with the database manager
  beside `secret.keys`.
- `held-keys.ts`: a paired browser's unlock is marked and never offered to anyone else
  (`unlockedSessionFor` skips it). **A latent bug fixed on the way:** `setTimeout` fires at
  once for a delay over 2^31-1 ms (24.8 days), so a 60-day unlock would have revoked itself a
  millisecond after it was made. The timer now counts in stretches and ends at the true end.
- `service.ts`, `seal-upgrades.ts`, `credential-changes.ts`: what the person proves for
  (create, rotate, sign-in, password change, seal upgrade) reaches their holders.

### Client gateway

`client-gateway/service/credential-custody.ts` (new) reports each moment the gateway
handles a credential it verified: `issued`, `confirmed`, `rotating` (before the new digest is
stored), `presented` (every hello and bearer request; cheap, no cryptography unless something
changed), `released` (last socket gone: the unlock leaves memory, the credential brings it
back), `forgotten` (trust ended). It can never fail pairing or reconnecting. A failure is
audited by step and error name only. `client.forget_pairing` is a new client message:
Forget in the extension previously changed nothing on Core.

### A paired credential's life

- **It slides.** 60 days from its last use (`trustedClientTtlMs`), renewed by every reconnect
  and by any request, written at most once a day. A browser that comes back every 59 days
  never pairs again. One unused for 60 days does.
- **A rotation is not over until it is confirmed.** Each reconnect sends a new credential once,
  over a socket that can drop as it is sent. The one before it stays valid until the new one
  is confirmed: by the client saying so (`client.credential_received`, new, sent only after
  its token storage has written) or by any use of the new one.
- **Bounded:** 14 days from that rotation (`credentialConfirmGraceMs`). Presenting the old one
  again cannot stretch it. I chose 14 days over the plan's 2 minutes because a reply is lost
  exactly when a laptop closes as the socket drops, and the bound only matters then: a client
  that received its credential ends the old one within a moment.
- **Replay once confirmed is refused,** and that browser's old wrap is deleted, so the old
  credential opens nothing even with the store. It is refused like any unknown credential
  (back to pairing, audited as `session.credential_rejected`). The plan's "revokes the browser
  and emails the owner" is not built: you asked for refusal, and revoking would let anyone
  holding a dead credential unpair the real browser.
- **The unlock follows it.** A reply that never arrived also leaves its wrap unusable: the next
  rotation from the old credential replaces it. The unlock's expiry slides with what it holds
  untouched, so a call in flight is not cut.
- `packages/client-gateway-websocket/src/transport.ts` sends the acknowledgement. An older
  client that never sends it is confirmed by its next use; an older Core ignores it.

### Who may use which unlock

A paired browser now uses **its own unlock only**. Before, any live unlock of the person's
paid for any of their browsers, which made "locks for that browser" impossible.

### The person's experience

- Before a task: `secret-keys snapshot` says of each of the caller's own keys whether
  their unlock opens it (`unlocked`), `readModelReadiness` answers `locked`, and the empty
  state shows one line with Open FluxIQ. A command that needs the model (`needsModelKey`:
  create-here, explore, improve) shows the same step instead of starting and spends
  nothing. A saved Flow still runs, as it did.
- During a task: `ModelProvider.whenReady` runs before an attempt starts its deadline
  (`runtime/models/retry/call.ts`), so the 45-second attempt deadline never fires during a
  wait. The task waits under `model_key_locked`, says so in its thread, wakes on an unlock, and
  a Stop ends it. Each wait is recorded against its Flow for the limits above to read.
- Every sentence is `modelKeyLockedWords(reason)`: why it locked and the one action. No sentence
  offers signing out or in as the fix. A reset says to add the key again, because no password
  opens it.

### Paths outside the brief's owned list, and why

Each is the smallest change the brief's requirements needed. Please check you accept them.

- `programs/identity-access/**` (additive): a `sessionEndSubscribers` option, a session end
  told by digest. Identity told listeners only raw ids it remembered, so an administrator's revoke
  after a restart told nobody. Before this change a restart had already locked everything;
  with stored unlocks it would have been a real hole.
- `runtime/models/retry/call.ts`, `runtime/models/contracts/provider.ts`,
  `runtime/llm/domain-instructions/provider.ts`: the wait's seam. The attempt deadline sits
  in `call.ts`, so a wait inside `runTask` would have read as a timeout.
- `packages/contracts/src/client-gateway.ts`: `client.forget_pairing`, additive; an older
  Core ignores it.
- `apps/web`: the approve route passes the approving session, the panel's cookie is
  presented, `projectPairedClientResponse` passes `unlocked`, and `secret-keys.tsx` has the
  unlock form, the one action that the setup step points to.
- `platform/iam`: the `secrets:Unlock` action, regenerated catalogs, and an `OwnUnlock`
  statement so a hosted user may unlock their own keys.
- `docs/architecture/automation-studio/client-gateway.md`: its paired-client paragraph was
  now wrong.
- Second round: `packages/client-gateway-websocket/src/transport.ts` sends the acknowledgement,
  and its tests' fakes keep it apart from what they pin. `packages/contracts/src/client-gateway.ts`
  adds `client.credential_received` and the two trust fields. `packages/contracts/src/task-attempts/`
  holds `model_key_locked`, and the words too (`model-key-lock.ts`), because the platform barrel
  carries zod, which the browser bundle refuses. `fluxiq/src/ui/index.ts` re-exports the words for
  the chat. `runtime/models/secrets/person-wait-clock.ts` is new. The extension's
  `connection/tests/gateway-session.test.ts` fake leaves the acknowledgement out of what it pins.
- The brief's `packages/ui-components/src/onboarding/**` does not exist; the readiness read
  is `packages/ui-components/src/chat/onboarding/`. The line is in `chat/view/empty-state-model.ts`,
  with `chat/chat-widget.ts` rechecking a `locked` read as it does a `missing` one.

## Every way of being locked, before and after

"Normal use" frequency is by reading the code, not measured.

| Way | How often before | Before | After |
| --- | --- | --- | --- |
| Approving panel session reaches its 12 hours | **Every day** for anyone not signing in again | Locked, extension looks paired | Not locked |
| Core restart or deploy | **Every restart**; a local user meets this constantly | Locked for everyone, panel and browser | Not locked. The browser's next hello or request brings it back; the panel's next request too |
| Sign-out in another browser | Whenever it happens | Locked if that was the person's only unlock | Not locked while the approving session lives |
| Sign-out of the approving session | Whenever it happens | Locked | **Still locks, as asked** |
| A person's own sign-out, when the approving session already ended | Whenever it happens | Locked if no other unlock | **Locks (fail closed).** See open questions |
| Renaming or editing a key in another session | Occasional | That session lost the key until sign-in | Comes back on the next message |
| Rotating a key in another session | Occasional | Others locked out of it | The rotator's own browsers get the new value; see open questions |
| Pairing a browser, then adding a key | First run | Worked only via the panel session's unlock, and only until it ended | Boxed to the browser at once, present or not |
| Pairing approved from a session with no unlock (after a restart) | After any restart | Locked | The session's unlock comes back from its cookie first |
| Forget this pairing | Whenever it happens | Core kept the trust; another unlock still paid | Trust ends, and the record is deleted |
| Administrator revokes the session | Rare | Locked, only if this process had seen the raw id | **Locks**, by digest, including after a restart |
| Administrator revokes the browser's trust | Rare | Locked | **Locks**; record deleted |
| Every session of a person revoked; account disabled or deleted | Rare | Locked | **Locks** |
| Key deleted | Rare | Locked for that key | **Locks** for that key |
| Password reset nobody proved the old password for | Rare | Keys unreadable | **Locks.** Keys stay unreadable, as before |
| Password change with the current password | Rare | Other sessions kept it | Re-boxed; the browser keeps its key |
| Credential life running out | **Monthly**, fixed at 30 days and never renewed | Browser must pair again | 60 days from last use. Only a browser unused that long pairs again |
| Rotated credential never delivered (socket dropped mid-reply) | Rare | Browser must pair again | The old one still works, up to 14 days, and the key comes back with it |

**The first start after this change.** Nothing was stored yet, so everyone needs their password
once. It is a setup step, never a failure: a task does not start, and says why and what to do.
An ordinary sign-in also clears it, since nothing locked them. What "once" means, so you can
overrule it: the explanation is said in a thread once for each person, across restarts, and a
later ask reads the plain sentence; the empty chat's line stays until the step is done, because
it is the step and has the action beside it; once done, it never comes back.

## The threat model, in plain words

What is on Core's disk per holder: a public key, a private key encrypted under a key that
only the credential derives, and data keys encrypted to that public key. Core keeps the
credential only as a SHA-256, and a panel session only as a SHA-256.

| Attacker has | Can they open a key? |
| --- | --- |
| The store alone (disk, backup, database manager) | **No.** Tested: no plaintext, and the digest opens nothing. Reversing it means finding a 256-bit random preimage (122 bits for a panel cookie, which also expires in 12 hours) |
| A credential alone | **No key value.** It can do what it always could: speak as that browser and spend the key through model calls, not read it. Reveal needs the password and is not on a token's allowlist |
| The store and a credential | **Yes, for that browser's boxes.** This is the design's boundary, as the brief states. Forgetting or revoking the pairing ends it: the record is deleted |
| The store and an old credential | No, once the new one is confirmed: its wrap is deleted. Until then it opens as the current one does. That window closes as soon as the client acknowledges, and at most 14 days after a lost reply |
| An old credential alone, in that window | The same as a current one: it can connect, which replaces the real browser's session and leaves that browser refused, so it pairs again, visibly. It is the price of not stranding a browser. It is bounded, audited, and needs a credential stolen in that window |
| Another person's or another browser's credential | **No.** Tested, including moving a victim's box onto the attacker's holder: the binding refuses it |
| Write access to the store | Cannot read a key. Can box a value of their own to a holder, so that person's model calls go out on the attacker's key. Not a new class of harm: they can already add a trusted client to that store |
| An operator of a hosted deployment, at rest | **No**, as above |
| An operator controlling the running process | Yes, and always could: the process holds keys while unlocked, and saw the password at sign-in. A difference to know about: it now also sees the credential at each request, so it need not wait for a sign-in |

**Rotating a key, said plainly.** Rotating destroys the old box, and the old key cannot open the new
seal. The new value then reaches the rotator's own paired browsers, because they just proved their
password. So rotating is not a way to lock out one of your own browsers: if a browser was compromised
and you rotate, it receives the new value until you forget it. Forget the pairing first, then rotate.
A rotation by anyone else reaches no browser of the owner's.

**Hosted deployments use the same design, and it needs no difference.** Nothing lets an
operator read a key without a person's credential. Records live in each workspace's own
store, memory custody stays the workspace manager's, and eviction changes neither.

**Logs.** Nothing logs a credential, password or key. Failures name a step and an error
type. Buffers are zeroed as `held-keys.ts` does; a JS string credential cannot be, nor can
a `KeyObject`, briefly alive during a box operation. No new secret is in the extension's
storage: it holds exactly the credential it held before.

## Commands run and observed results

**Reproduced first, provider-free, on today's wiring.**
`src/programs/_shared/tests/runtime-credential-unlock.test.ts`, real gateway, identity and
Secret Keys over SQLite on disk, before any fix:

```text
Tests  5 failed | 4 passed (9)
AssertionError: expected null to be 'dummy-provider-key-value-for-runtime'   (x3: after a restart, through reconnects, and before an administrator's revoke)
AssertionError: expected { ...(11) } to be null                              (forgetting: the credential still spoke)
AssertionError: expected undefined to be false                               (no readiness to read)
```

The 4 that passed then were lock tests, which pass trivially when everything is locked. So
they prove nothing alone; the guard-breaking run below is what shows they bite. A session
expiring and a sign-out elsewhere were established by reading `held-keys.ts` and from tests
that already pinned them (`unlocked-session-for`, and `session-key-provider`'s "keeps a build
going after its started-from session logs out ... then fails with secrets.locked"), not by a
new reproduction on the old code. Their new tests are in `unlocks/tests/credential-unlocks.test.ts`. The
service-level file failed 33 of 33 before its API existed (`TypeError: service.presentCredential
is not a function`), which is a weak form of failing first, for the same reason.

**Each guard broken in turn.** Because "seen failing first" is weak for new code, I broke each
guard, ran the tests that should notice, and restored it. Across both rounds, 6 were first caught
by nothing, each a real gap, and I added a test for each. One more looked missed, but it was a mistake
in what I broke: a stale index entry is checked again anyway, so I broke the real guard instead. One
that first printed no summary had run out of the time I gave it, on a loaded machine, and it was caught
when re-run alone. Final state, 39 guards, all caught:

```text
CAUGHT  a lock leaves the boxes: Tests  7 failed | 35 passed (42)
CAUGHT  a lock does not stop a live unlock re-seeding it: Tests  7 failed | 35 passed (42)
CAUGHT  any sign-in lifts a lock: Tests  1 failed | 41 passed (42)
CAUGHT  a password that opened nothing lifts a lock: Tests  1 failed | 41 passed (42)
CAUGHT  a credential that does not fit may replace a record: Tests  2 failed | 40 passed (42)
CAUGHT  a box is held without checking the current seal: Tests  1 failed | 41 passed (42)
CAUGHT  confirming leaves the old wrap: Tests  2 failed | 40 passed (42)
CAUGHT  a rotation drops the wrap the browser still holds: Tests  3 failed | 51 passed (54)
CAUGHT  a rotation keeps the lost reply's wrap: Tests  1 failed | 41 passed (42)
CAUGHT  a slid life re-holds and cuts a call in flight: Tests  1 failed | 41 passed (42)
CAUGHT  a deleted key's box stays: Tests  1 failed | 41 passed (42)
CAUGHT  release leaves memory held: Tests  2 failed | 40 passed (42)
CAUGHT  a first-start explanation is said every time: Tests  1 failed | 41 passed (42)
CAUGHT  a sign-out does not say why: Tests  2 failed | 40 passed (42)
CAUGHT  a reset is not told: Tests  2 failed | 40 passed (42)
CAUGHT  a wrap is not bound to its holder and person: Tests  12 failed | 30 passed (42)
CAUGHT  a timer cannot count 60 days: Tests  2 failed | 40 passed (42)
CAUGHT  a long unlock ends at the first stretch: Tests  2 failed | 40 passed (42)
CAUGHT  a paired browser's unlock is offered to others: Tests  1 failed | 18 passed (19)
CAUGHT  a session's end is not told by digest: Tests  4 failed | 8 passed (12)
CAUGHT  a whole person's end does not lock: Tests  1 failed | 11 passed (12)
CAUGHT  a reset does not lock: Tests  1 failed | 11 passed (12)
CAUGHT  a paired caller may fall back to the person's other unlocks: Tests  1 failed | 11 passed (12)
CAUGHT  custody does not end the old wrap on confirmation: Tests  1 failed | 11 passed (12)
CAUGHT  the wait runs inside the attempt's deadline: Tests  2 failed | 7 passed (9)
CAUGHT  a wait is not recorded against its Flow: Tests  1 failed | 20 passed (21)
CAUGHT  one Flow's wait lends time to another: Tests  1 failed | 8 passed (9)
CAUGHT  the setup step does not stop the command: Tests  1 failed | 9 passed (10)
CAUGHT  the setup step is not noted as told: Tests  1 failed | 9 passed (10)
CAUGHT  an old credential outlives its bound: Tests  1 failed | 16 passed (17)
CAUGHT  an old credential stays after confirmation: Tests  1 failed | 16 passed (17)
CAUGHT  the old credential is not kept for a lost reply: Tests  7 failed | 10 passed (17)
CAUGHT  presenting the old one stretches its bound: Tests  1 failed | 16 passed (17)
CAUGHT  a reconnect does not slide the life: Tests  1 failed | 16 passed (17)
CAUGHT  a request does not slide the life: Tests  1 failed | 16 passed (17)
CAUGHT  a request's write is not throttled: Tests  1 failed | 16 passed (17)
CAUGHT  the view shows a digest: Tests  1 failed | 16 passed (17)
CAUGHT  the client's word confirms nothing: Tests  3 failed | 14 passed (17)
CAUGHT  using the old credential confirms the new: Tests  1 failed | 16 passed (17)
```

**Failing first for the second round.** The credential lifetime tests in
`client-gateway/service/tests/credential-lifetime.test.ts` were written against the change and were
not run on the old code. The old code's behaviour they replace is plain from the tests that had pinned
it: `service.test.ts` asserted the old token refused the moment a new one was sent, which is the
stranding, and I changed that test. The guards above are what show the new tests bite.

**Acceptance and other checks,** last run after every source edit, named paths only, `--minWorkers 1
--maxWorkers 2`. "acceptance" is, in `packages/fluxiq`: `src/programs/secret-keys src/runtime/models/secrets
src/runtime/models/retry src/runtime/conversations/commands src/runtime/conversations/instructions`, the
gateway's `pairing-flow`, `pairings`, `credential-custody`, `credential-lifetime`, `service`,
`service-hardening`, `trust-domain` and `trace-tap` tests, `runtime-credential-unlock`,
`runtime-session-revocation`, `src/platform/iam/catalog src/platform/iam/parity`,
`caller-paid-result-check`, `endpoint-classification`, `global-identity-access`, identity's `handlers`,
`session-key-provider`, `deepseek-session-key`, `anthropic-session-panel`, `instance-leak`,
`model-provider-disabled-run`.

```text
contracts build        -> exit 0
fluxiq check           -> exit 0
fluxiq build           -> exit 0
ws check               -> exit 0
ws build               -> exit 0
ui check               -> exit 0
ui build               -> exit 0
web check              -> exit 0
core audit             -> exit 0, structure-audit: passed (493 warning(s), 1097 baselined).
ui tests               -> exit 0, Tests 28 passed (28)
ws tests               -> exit 0, Tests 57 passed (57)
contract tests         -> exit 0, Tests 91 passed (91)
web route test         -> exit 0, Tests 23 passed (23)
domain build           -> exit 0
extension check        -> exit 0
ext audit              -> exit 0, structure-audit: passed (234 warning(s), 553 baselined).
ext tests              -> exit 0, 412 tests, 412 pass, 0 fail
acceptance             -> exit 0, Tests 553 passed (553)
```

`.structure-baseline.json`, `runtime/llm/evidence-loop*`, `framework/automation-service/service.ts`,
`package.json` versions and both shared checkouts are untouched. The contracts, fluxiq, ui-components,
websocket and domain libraries were rebuilt in the worktrees so the web and extension checks read the
new types. `dist` is untracked.

## What could end a task during a wait of hours

The rule is that a task ends only with its result or its budget gone. Traced from the wait upward.
**None of these is in my paths, so all are named for the Exploration lane, unfixed.** I corrected my
first report here: I said `maxDurationMs` had no setter, and it has. Each fix below is to read
`automationStudioPersonWaitClock.clock({ projectId, flowId })`
(`runtime/models/secrets/person-wait-clock.ts`), which stands still while that Flow waits, and only
that Flow, so a person who never returns lifts nobody else's limit. It is built, tested and recorded
by every wait, with no reader yet.

| Clock | Where | Limit | What happens during a wait | Fix |
| --- | --- | --- | --- | --- |
| **A project build's whole time** | `runtime/project-agents/supervisor/supervisor-loop.ts` (`startClock`), `loop-limits/project-build-duration.ts` | 30 minutes, work stops at 25 | Timers abort the signal the wait is on. **Ends the task**, reported as out of time | Timers cannot pause: re-arm them for what is left when a wait ends, or check the paused clock when they fire and re-arm |
| **A Flow build's time** | `loop-limits/flow-bootstrap-evidence-loop.ts` (`maxDurationMs`), read by `llm/evidence-loop.ts` and `flow-authoring/bootstrap/unfinished-build/phases.ts` | 9 minutes | No abort, but on waking the budget reads as spent. **Ends the task**, reported as out of time | Set `budget.now` and `phases`' `input.now`, built in `automation-service/service.ts` (line 1557), which I may not touch |
| **A recovery's time** | `adaptation/recovery/recovery-deadline.ts`, `annotation/annotate.ts` | 10 minutes | Same as the next row: it is what caps it | Start the deadline on the paused clock |
| **An exploration's time** | `adaptation/recovery/exploration-budget.ts` (`arm`) | 10 minutes at most | A timer aborts the signal the wait is on. **Ends the recovery** as `budget_exhausted` | Re-arm on the paused clock; it already takes a `now` |
| **A result check's deadline** | `result-verification/deadline.ts`, `build-test/judge.ts`, `run-outcome.ts` | 120 seconds or more | The race settles `timed_out`, so the run ends **unjudged**. Worse, the judge goes on waiting behind it, and **on an unlock it spends a model call nobody reads** | Give the judge a signal the deadline aborts, and do not count held time |
| **A child Flow's bound** | `engine/automation/composite/child-bounds.ts`, `boundary.ts` (`deadlineAt`) | The child's own `timeoutMs` | A model call made inside a bounded child is aborted. **Ends that child** | Only reached by a repair inside a composite. Worth checking whether one can be |
| **A workspace being evicted** | `apps/web/src/lib/workspaces/instance-busy.ts` (hosted, LRU) | When over 100 instances | A waiting task is busy only through a gateway session or a project database. With the browser closed and tracing off, it can read as idle, and eviction closes the instance under it. **Ends the task** | Count work in `activity()`, or a wait |
| **A Core restart** | Everything | Any deploy | An in-flight build is in memory, so it is lost, as it always was | Not a clock. Needs durable tasks |

Checked and fine:

- **An attempt's 45 seconds and the retry budget:** held time is outside both (`retry/call.ts`; caught by a guard below).
- **The chat's 24-second reading:** a panel command has no wait; a locked key there falls back to the offline reading.
- **A host lease:** no time limit. It is held throughout, so **a waiting build keeps others queued behind it on the same host**. Not an ending, but worth knowing.
- **Gateway commands' 30 seconds:** none is in flight during a wait.
- **The event-writer lease:** its 30-second expiry is only read when a new writer asks. Nothing but `recoverExpiredSpools`, which nothing outside tests calls, treats an expiry as a loss.
- **Parked runs:** a run parked for a person has its own deadline, but a locked key does not park.

**A page after hours is not a clock, but it is real:** the site's own session may have ended by the
time the person returns. That lands in the ordinary retry path.

## Not verified

- **No real browser, by the brief's limits.** AGENTS.md asks for manual validation of pairing,
  storage and panel behaviour where feasible. Someone should pair a real extension, restart
  Core, and watch: the empty state, Open FluxIQ, the panel's Unlock form, Forget, and a task
  waiting and resuming. The panel form has no test of its own: only a typecheck.
- **No full suite**, by the twice-a-day rule. The next sweep should run; I touched the retry
  seam every model call passes through and the provider contract.
- **Long waits end to end.** The wait is proved at the provider seam. The table above comes from
  reading the code, and none of it has been run. The event-writer row in particular is by reading.
- **The thread's waiting sentence through a real build.** `onKeyWait` is proved with a fake host,
  and the runtime's wiring only by typecheck: the runtime test runs with model providers off.
- **A real socket dropping as the credential is sent.** The lost reply is simulated by a browser
  coming back with its old credential.
- **A chat already open** learns of a lock on its next readiness read, which runs for the empty
  latest chat only. In a thread with turns, the person learns when they ask (the setup-step reply).
- Windows only. The crypto is Node's and platform-neutral, but it has not run elsewhere.

## Open questions or contradictions found

1. **For you: the clocks above.** The hard rule stands unmet there until the lane adopts the clock.
   I recommend the project build's and Flow build's first: they end the commonest tasks. The result
   check's orphaned spend is the one that costs money.
2. **For you: what "once" means for the first start.** See the note under the table.
3. **Forgetting while offline** drops the credential locally and tells Core nothing, so the trust
   stays until it expires, now up to 60 days from its last use. Nothing can open the record without
   that credential, but a copy stolen earlier still could. The panel's existing
   `revoke-client-trust` ends it.
4. **An Automations Run with a locked key** still runs deterministically, with no repair and no
   word of why, as it did. I kept that, since it is not a task failing; it may deserve a line.
5. **Mid-call race.** The wait is checked just before an attempt. A lock landing between that check
   and the release inside the attempt still raises `secrets.locked` for that one call. Small window;
   closing it would mean retrying on that error in the retry policy.
6. **After a reset, the panel's Unlock form** cannot help: no password opens the key, and it says so
   only as "That did not unlock your keys". The chat's line says to add it again, which is right.

## Note for the lead: `hosted-production-plan.md`

These lines are yours to edit, and are now out of date:

- **Lines 51-54 (S5):** "Resolve the user's live unlock on each call, else a typed
  `secrets.locked`" becomes: a paired browser resolves its own unlock, which lasts as long as its
  credential (`programs/secret-keys/runtime/unlocks/`); a call whose key is locked waits for the
  person; `secrets.locked` remains only where nothing can wake it.
- **Lines 425-426:** `approvingSessionId` is no longer audit only. Its digest is what links a browser
  to a sign-out.
- **Lines 579-586 (Unlock):** "H2 adds a browser-held unwrap key" is done, without a new secret in the
  browser. "After a restart or a key's own expiry, one message covers every locked path" no longer
  holds for a restart. "The panel offers a re-unlock with the password" is now built
  (`secret-keys` `unlock`).
- **Line 584:** "a logout during a build no longer fails it while another unlock lives" changes for a
  paired browser: it uses only its own unlock, and waits.
- **Lines 738-741:** "a restart, deploy or eviction locks every key and users sign in", and "Unlock
  after restarts: users sign in again after a deploy until H2; announce and drain", no longer hold.
- **Row 10 and line 571:** "Decrypted keys exist only in memory for that user's unlocked sessions" stays
  true, with one addition: wrapped copies are at rest, opened by the holder's credential.
- **Line 427:** "Rotates on every connect (sliding 60 days); the previous one stays valid once for 2
  minutes. Presenting an older one revokes the browser, audits it and emails the owner" becomes: the
  previous one stays valid until the new one is confirmed in use, at most 14 days, and is then
  refused and audited; the email and the revoke are not built.
- **Line 585 (N4):** the sentence is now "Unlock your model key: open app.getfluxiq.com and enter your
  password once".
- **The operator's kill switch** `revoke-all-browser-credentials` should also forget their stored
  unlocks. `revokeTrustedClient` already does, so build it on that.
