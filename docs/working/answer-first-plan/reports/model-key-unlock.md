# A person's model key stops locking in normal use (t865)

## Outcome

**All sixteen review findings are fixed**, each with a permanent test, and each test was checked by
breaking its guard. **A real headed browser went through the whole thing with no model call, and all 12
checks held.** That run also found a real bug the tests had missed, now fixed (below).

Two things are still true:

- **The hard rule is not met above a model call yet.** A locked key waits without failing and resumes,
  but the limits above that call read a wall clock, so a wait of hours can still end a task there. They
  are outside my paths and listed below for the Exploration lane, unchanged from round 2.
- **None of this is reviewed yet.** You said the same reviewer re-runs the attacks before it merges.

## When a person is asked for a password

After setup, a normal person is not asked again. Held by tests, and seen in a real browser for the restart.

**Asked, once each:**

1. **Pairing a browser.** The approval dialog has an optional password box. Filled, that browser is done
   for good. Left empty, it pairs fine and shows the Unlock step once.
2. **A browser already paired when this ships.** The same one-time Unlock step.
3. **After signing out of FluxIQ,** for the browser that sign-out locked, when they next want it.
4. **After an administrator ended their session, or all their sessions were ended.**
5. **After changing their password,** for each other browser, not the one they changed it from.
6. **Re-pairing:** after Forget, after 60 days unused, or after a stolen credential was caught. Same as 1.
7. **Signing in to the FluxIQ panel,** as always. That is sign-in, and it does not reach a locked browser.

**Told to add the key again, because no password can open it:** after a password reset nobody proved the
old password for.

**Never asked:** a Core restart or deploy, a reconnect, a panel session expiring, a credential rotating, a
key added or rotated, and never in the middle of a Flow: a task that finds its key locked waits and
carries on. The proof is what sign-in asks: a password, and the 2FA code where one is set. Never a PIN.

## The sixteen findings, and what now holds

| # | What now holds | How | Permanent test |
| --- | --- | --- | --- |
| F1 | A Flow's standing result check can only draw on a session of the person who authorized it, and no client write can set that authorization | The reveal refuses a paired handle. Settings patches and whole-Flow saves keep what is stored. A paired unlock is held under a random per-process handle | `reveal-holder`, `stored-check-authorization`, `flow-check-authorization`, `credential-unlock-proofs` |
| F2 | A stored row earns nothing by being there | One list of sensitive stores. The unlock store is read only after a recheck and written only by its owner. Only a holder the host vouches for is boxed to, failing closed with no answer bound | `sensitive-stores`, database-manager `handlers`, `credential-unlock-proofs`, `runtime-credential-unlock` |
| F3 | A new browser gets the key only on a proof from its person | No seeding. Optional password at approval, otherwise the one-time step. A reset drops live unlocks. Setting someone else's password ends their sessions | `credential-unlock-proofs`, `runtime-credential-unlock`, approve-pairing `route` |
| F4 | A retired credential coming back ends the trust, for thief and browser alike | At most 32 digests on the trust record. On a hello or a request it revokes, forgets the unlock and audits `credential.reuse_detected` with the trusted client id. The lost-reply window is not a reuse. No upper bound on renewal, since this covers it | `credential-reuse` |
| F5 | A proved password change keeps only what the acting session holds | Its panel row and the browsers it approved. Others lock with `password_changed`, worded as a setup step. A Flow running elsewhere waits | `credential-unlock-proofs`, `runtime-credential-unlock` |
| F6 | An unlock lifts only what the person chose | `unlock` takes `clientIds`, and naming none lifts none. One locked browser is named on the button ("Unlock Chrome on Windows"); several are a list with label and last use | `credential-unlock-proofs`, secret-keys `handlers`; the one-browser case seen in a browser |
| F7 | A failed write does not leave the rest unlocked | Every holder is attempted, memory goes first, failures are raised together, and locks are written before the session is deleted | `credential-unlock-proofs`, `session-revocations`, identity `service` |
| F8 | A revoke during a reconnect stands | The trust is checked again after each wait, and a holder forgotten in this process cannot come back from a presentation in flight | `credential-reuse`, `credential-unlock-proofs` |
| F9 | Disabling a person locks them | `updateUser` going from enabled to disabled ends their sessions | identity `service`, `runtime-credential-unlock` |
| F10 | Password guesses at a recheck are limited | 8 failures in 15 minutes hold that person's rechecks for 15 minutes, without running the slow derivation | `credential-attempts`, identity `service` |
| F11 | An old credential with an old row copy opens nothing written since | A rotation writes a whole new key pair beside the old, promoted on confirmation | `credential-unlock-proofs` |
| F12 | A client confirms only the credential that session was sent | The session keeps the digest it was sent | `credential-reuse` |
| F13 | A person is never told a trust ended when Core has not heard | Forget tries the socket, then a credential-authorized route, then keeps it for the next chance and says so, pointing to the panel's revoke | `forget-delivery`, `forget-outcome-words`, forget-pairing `route`, `credential-reuse` |
| F14 | A content script can neither read the credential, nor send it elsewhere, nor end its trust | `connect` and `resetSession` are control-page-only. Local storage is closed to untrusted contexts, with the overlay's one value moved behind the background | `credential-messages`, `overlay-placement`, `placement-memory` |
| F15 | Dead holders take nothing, and a client with no row is locked | Vouching, and rows start locked, so a lock with no row has nothing left to do | `credential-unlock-proofs` |
| F16 | A forgotten row is overwritten in the file | `secure_delete` on this store | `sqlite-repository`, `runtime-credential-unlock` (looks in the file on disk) |

The review's checks of the crypto, of log and wire exposure and of CSRF held, so I did not redo them.

## What the real browser showed

`node packages/test-runner/dist/extension-chat-check/cli.js --browser chrome --scenario everything-store --page ./ --no-ask --model-key`:
headed Chromium, the real side panel, an isolated Core, a dummy key, provider credentials scrubbed from the
process, and the network guard on, which reported no violations. No model call.

| Step | Core said | The panel showed |
| --- | --- | --- |
| Paired by the Lab's own approval, with the password | unlocked | No setup step |
| Core restarted on its ports, same stores | unlocked; extension reconnected by itself, no pairing | No setup step |
| Signed out of the approving session | `locked:signed_out` | "Your model key locked on this browser because you signed out of FluxIQ. Open FluxIQ and enter your password once to unlock it." with Open FluxIQ |
| Secret Keys page: pressed "Unlock Chrome on Windows", password only, with a PIN set on the account | unlocked | No setup step |
| Forget, over the live socket | Core heard it | |
| Paired again in the panel's dialog, password filled | unlocked | No setup step |
| Forget, then paired in the dialog, password empty | connected, `locked:first_unlock` | "FluxIQ now keeps your model key unlocked on this browser, and needs your password once to set that up. Open FluxIQ and enter it there." |
| The one-time step | unlocked | No setup step |

**The bug it found.** The first run failed at the Unlock button: "That did not unlock your keys." My tests all
passed. The panel page polls while the password is being checked, and each poll presents the same session,
which replaced the unlock being filled, so the proof ended as "unavailable". A person with the panel open would
have hit this most of the time, which is the very complaint. It would have hit approval with a password too. A
proof running on a session now holds off presentations of it, with a test that failed first with exactly that
error.

**Two more things I saw, not fixed:**

- **An already-open side panel did not show the step.** After the sign-out, the reopened panel showed it, and the
  side panel beside it still showed the plain empty chat. The readiness read runs when the chat opens. The person
  learns when they ask, from the setup-step reply. Known since round 1.
- **After Forget and pairing again, with no project selected, the chat sat on "Loading the conversation...".** It
  was still there in screenshots across two pairings, about a minute. Once the Lab selected the project, as it does
  after any pairing, it drew in under 400 ms. I did not establish what a real person sees here, or whether this
  predates this work. Worth a look; it is not the model key.

Evidence is in my scratchpad's `browser-evidence/2026-11-04T15-41-00-516Z-chrome/`, and is disposable. The several-browsers list, the wrong-password
path in the dialog, and Firefox were not exercised in a browser.

## Decisions I made beyond your list, for the reviewer

1. **The unlock store refuses a caller's put and delete even after a recheck.** Your fix made it sensitive.
   A recheck alone would still let an administrator forge a row under a real holder's id, which vouching
   cannot tell apart. Nothing legitimate writes it by hand.
2. **The whole-Flow save is stripped too.** You named client patches. `save-flow` carries the same metadata,
   so it gets the same rule. Direct service calls inside Core still may write it.
3. **Unlocking and approving ask for no PIN.** **This loosens what the reviewer saw**, which was password,
   PIN and TOTP. It follows "no PIN for normal actions": this is setup, and sign-in does not ask for one.
4. **A 2-minute grace on a just-retired credential.** A request already in flight when its credential is
   confirmed is refused but revokes nothing. Without this, an ordinary race would unpair a real browser.
5. **What counts as a reuse.** A previous credential past its window counts. So does a superseded lost
   reply, if it is ever presented, because then someone else had it. Reported, it costs a re-pair.
6. **"Connected through the session"** in F5 means the acting session's panel row and the unlocked browsers
   that session approved.
7. **A browser's name** in its hello is now "Chrome on Windows", not "FluxIQ Browser Extension", so a person
   can tell theirs apart. Two Chromes on Windows read the same; the list's last-use time separates them.
8. **A pending forget keeps the credential in the extension's storage,** as `fluxiq.pendingForget`, after
   Forget. It is the one secret pairing already held, protected the same way, and only long enough to tell
   Core: dropped when Core answers, or unsent after 60 days, when it has ended by itself. The person is told.
9. **Lab pairing proves itself.** `FluxIQControlClient.approvePairing` sends the password, and the demo
   workspace fills the dialog's box, because a Lab browser with no proof would now wait on a person. The demo
   workspace's fallback through the Connected browsers list has no password box, so that path pairs locked.
10. **New Lab check:** `extension-chat-check --model-key`, with `restartCore` on a topology and `stop(name)`
    on the process supervisor, so this can be run again.
11. **A public `access` field on the gateway service,** for `forgetByCredential`, because the facade is at its
    40-method limit.

## What remains after these fixes

- **A failed lock write followed by a restart.** In this process it holds: memory is cleared and the row is
  marked. If the write failed and Core restarts before anyone retries, that row reads as it was. Locks are
  now written before a session is deleted, so a plain crash leaves a lock and a live session, but a store
  that refuses the write is not recoverable from here. A person's next sign-out or revoke tries again.
- **Someone who can write the database file directly.** Vouching stops a row with no trust behind it. A
  writer who also edits the trust store, or replaces a real holder's public key, can still receive a box at
  the person's next proof. They hold the file, and the design does not defend against them. The API path is
  closed.
- **Firefox has no `setAccessLevel`.** There a content script can still read `storage.local`; the sender gates
  are what stand.
- **Two live connections from one browser with the same credential.** The extension builds one connection at
  a time, so this should not arise, but if it stored an older credential after a newer one it would read as
  a reuse after 2 minutes, and that browser would pair again. It fails closed.
- **A restored browser profile** presents a retired credential and pairs again, as the review said it should.
- **An operator controlling the running process** can do what they always could.

## The design, in short

Each holder has an X25519 key pair. Data keys are boxed to the public key; the private key is wrapped under a
key derived from the credential (HKDF-SHA256, AES-256-GCM), bound to holder, person and record. So a key the
person adds while a browser is away still reaches that browser, and reading the store opens nothing. Files:
`programs/secret-keys/runtime/unlocks/crypto.ts` and `credential-unlocks.ts`, `held-keys.ts`,
`client-gateway/service/credential-custody.ts`, `trusted-clients.ts`, `lifecycle.ts`, `access.ts`.
`docs/architecture/platform.md`, "An unlock lasts as long as its credential", is the current description.

A paired credential slides: 60 days from last use, renewed by every reconnect and request. The one before the
current stays valid until the new one is confirmed, at most 14 days, so a lost reply strands nobody. While a key
is locked, `ModelProvider.whenReady` holds a call before its attempt deadline starts, under the wait reason
`model_key_locked`. Every sentence about a locked key comes from `modelKeyLockedWords`.

## Paths outside the brief's owned list

Round 1 and 2's list stands (`identity-access`, the retry seam, `contracts`, `apps/web`, `platform/iam`,
`ui-components`). New this round:

- `programs/database-manager/sensitive-stores.ts` and its handlers; `framework/persistence/repository/sqlite-repository.ts` (a `secureDelete` option); `runtime/result-verification/check-authorization/reveal.ts`; `framework/automation-service/service/flow-settings-requests/` and `programs/automation-studio/api/handlers/flows.ts`.
- `programs/identity-access/runtime/sessions/credential-attempts.ts`, and two parameter lists of its `service.ts` moved to named types to stay under its 800-line limit.
- `apps/web/src/app/api/client-gateway/forget-pairing/`, the pairing dialog, and the Secret Keys page.
- Extension: `background/forget-delivery/`, `background/overlay-placement.ts`, the content script's placement memory.
- Lab: `http-control`, `coordinator`, `process-supervisor`, `demo-workspace`, `extension-chat-check`.

`framework/automation-service/service.ts`, `runtime/llm/evidence-loop*`, `.structure-baseline.json`, `package.json` versions, `fxlab/` and both shared checkouts are untouched. `pnpm install --offline --frozen-lockfile` ran once in the extension worktree, because dev's merge added a link it lacked; its `prepare` step sets `core.hooksPath` there, which is what it always sets.

## Every way of being locked, before and after

"How often" is by reading the code, not measured.

| Way | How often before | Before | After |
| --- | --- | --- | --- |
| Approving panel session reaches its 12 hours | **Every day** for anyone not signing in again | Locked, extension looks paired | Not locked |
| Core restart or deploy | **Every restart** | Locked for everyone | Not locked. The credential or cookie brings it back |
| Sign-out in another browser | Whenever | Locked if that was the only unlock | Not locked while the approving session lives |
| Sign-out of the approving session | Whenever | Locked | **Locks,** and says why |
| Own sign-out, approving session already ended | Whenever | Locked if no other unlock | **Locks (fail closed)** |
| Renaming or editing a key elsewhere | Occasional | Lost until sign-in | Comes back on the next message |
| Rotating a key elsewhere | Occasional | Others locked out | The rotator's unlocked browsers get the new value |
| Pairing, then adding a key | First run | Worked only until the panel session ended | With the password at approval, boxed at once, present or not. Without it, after the one-time step |
| Pairing with no password given | Every pairing | Used the live unlock | **Locked, with the one-time step** |
| Forget this pairing, online | Whenever | Core kept the trust | Trust ends, record deleted |
| Forget this pairing, offline | Whenever | Core kept the trust, silently | Delivered when it can be, and the person is told until then |
| Administrator revokes the session or the browser | Rare | Locked, if this process knew the raw id | **Locks,** by digest, after a restart too |
| Every session revoked; disabled or deleted, by any path | Rare | Locked by provisioning only | **Locks,** including `update-user` |
| Key deleted | Rare | Locked for that key | **Locks** for that key |
| Password reset with no old password | Rare | Keys unreadable | **Locks,** live unlocks go too, keys stay unreadable |
| Someone else sets a person's password | Rare | Their sessions lived on | **Their sessions end** |
| Password change, proved | Rare | Other sessions kept it | The acting session and its browsers keep it; **others lock** with `password_changed` |
| A retired credential presented | Rare | Refused, indistinguishable from noise | **Trust revoked,** audited by client |
| Credential life running out | **Monthly**, fixed at 30 days | Pair again | 60 days from last use |
| Rotated credential never delivered | Rare | Pair again | The old one still works, up to 14 days |

## The threat model, in plain words

On Core's disk per holder: a public key, a private key encrypted under a key only the credential derives, and
data keys encrypted to that public key. Core keeps a credential and a panel session only as SHA-256 digests.
This table replaces the earlier one; rows marked "corrected" were wrong there, "new" were missing.

| Attacker has | What they get |
| --- | --- |
| The store, read only (disk, backup) | **Nothing opens.** Tested: no plaintext, and a digest opens nothing |
| The database manager API | **Corrected.** Reading needs a recheck. Writing the unlock store is refused to everyone, recheck or not. Nothing is boxed to a row with no trust behind it |
| Direct write access to the database file | **Corrected.** Not defended. A writer who edits a real holder's row can receive a box at the person's next proof. Reading alone still opens nothing |
| Only a holder's public id | **New.** Nothing. The id reaches no reveal, because unlocks are held under a random handle |
| A panel cookie alone | **New.** It can pair a browser, which starts locked and takes nothing. No password, no key. Password guesses are limited |
| A current credential alone | **New.** No key value. It can speak as that browser and spend through model calls until it is caught, which is when the real browser next presents what it holds: that ends the trust for both |
| A credential in the lost-reply window | The same as a current one, for at most 14 days |
| A credential once retired | **Corrected.** Nothing, and presenting it ends the trust and is audited by client |
| The store and a current credential | **Yes, that browser's boxes.** This is the design's boundary. Forgetting or revoking ends it |
| An old credential and an old copy of its row | **Corrected.** Only what that copy already held. Later boxes are sealed to a newer key pair |
| Another person's credential | **No.** Tested, including moving another holder's box onto one the attacker holds |
| A password reset nobody proved | **Corrected.** No live unlock survives, and a browser paired then takes nothing |
| A disabled person's browser | **Corrected.** Locks by every path |
| A forget during a reconnect | **Corrected.** It stands |
| A compromised content script | **New.** Cannot read the credential in Chrome or Edge, redirect it or end the trust. Firefox: the sender gates only |
| An operator of a hosted deployment, at rest | **No,** as above |
| An operator controlling the running process | Yes, and always could: the process holds keys while unlocked and sees a credential at each request |

**Renewal has no upper bound.** A credential used within every 60 days lasts for ever. That is deliberate: "a
browser in regular use never pairs again" is the requirement, and reuse detection is what covers a stolen one.

**Rotating an API key, said plainly.** Rotating destroys the old box, and the new value reaches the rotator's
own unlocked browsers. So if a browser was compromised, rotating alone does not lock it out: **forget that
browser first, then rotate.** A password change does lock the others, and a rotation by anyone else reaches no
browser of the owner's.

**Hosted deployments use the same design.** Records live in each workspace's own store, and eviction changes
neither that nor memory custody. Hosted scoping is by reading, not run.

**Logs.** Nothing logs a credential, password or key. Failures name a step and an error type. Buffers are
zeroed as `held-keys.ts` does; a JS string credential cannot be, nor a `KeyObject` during a box operation.
**Extension storage** holds the credential it always held, plus the pending forget above, which is that same
credential.

## Commands run and observed results

**Each attack the review proved is now a test that asserts it fails,** written from the review, and states what
must hold. Dummy secrets only; fake keys that look like keys are built from parts.

**Each guard broken in turn, then restored.** 98 guards were caught one by one, 35 of them carried over from the first rounds and the rest new. **On the first pass 4 were caught by nothing, and those were real gaps in my tests:** the database-manager harness did not register the unlock store, the forged row was not locked so the list would never show it anyway, the "wrong password" test did not check the lock itself, and my test of F12 used a session that had already been replaced. I fixed each test and re-ran it. Web's 5 first failed to run at all because Core's source was newer than its build while Core's guards were being broken, so they ran after a rebuild. One took longer than its time limit under load and was caught on re-run.

One guard is caught only with its partner: "an old credential outlives its bound" passes alone now, because reuse detection refuses the same credential first. Breaking both together: `Tests 1 failed | 16 passed (17)`.

```text
CAUGHT  F1 a reveal draws on a paired browser's unlock: Tests  1 failed | 1 passed (2)
CAUGHT  F1 a client's authorization is kept: Tests  1 failed | 3 passed (4)
CAUGHT  F1 a settings patch is not stripped: Tests  2 failed | 1 passed (3)
CAUGHT  F1 a saved Flow is not stripped: Tests  2 failed | 1 passed (3)
CAUGHT  F1 an unlock is held under its public id: Tests  1 failed | 24 passed (25)
CAUGHT  F2 the unlock store is not sensitive: Tests  3 failed | 19 passed (22)
CAUGHT  F2 a row with no vouch is boxed to: Tests  3 failed | 22 passed (25)
CAUGHT  F2 an unbound host vouches for everyone: Tests  1 failed | 24 passed (25)
CAUGHT  F2 the host vouches for any row: Tests  1 failed | 17 passed (18)
CAUGHT  F3 a new holder starts unlocked: Tests  5 failed | 20 passed (25)
CAUGHT  F3 a reset leaves live unlocks: Tests  1 failed | 24 passed (25)
CAUGHT  F3 someone else's password leaves their sessions: Tests  1 failed | 17 passed (18)
CAUGHT  F4 a hello is not checked for reuse: Tests  3 failed | 10 passed (13)
CAUGHT  F4 a bearer is not checked for reuse: Tests  1 failed | 12 passed (13)
CAUGHT  F4 reuse is not audited: Tests  1 failed | 12 passed (13)
CAUGHT  F4 reuse does not revoke: Tests  4 failed | 9 passed (13)
CAUGHT  F4 a confirmed credential is forgotten rather than retired: Tests  5 failed | 8 passed (13)
CAUGHT  F4 no grace for a request in flight: Tests  1 failed | 12 passed (13)
CAUGHT  F4 the lost-reply window counts as reuse: Tests  2 failed | 11 passed (13)
CAUGHT  F4 what is remembered is unbounded: Tests  1 failed | 12 passed (13)
CAUGHT  F4 the panel sees retired digests: Tests  1 failed | 12 passed (13)
CAUGHT  F5 a password change keeps every holder: Tests  3 failed | 22 passed (25)
CAUGHT  F5 a password change leaves other live unlocks: Tests  1 failed | 24 passed (25)
CAUGHT  F5 a change locks without saying why: Tests  1 failed | 24 passed (25)
CAUGHT  F5 a change does not keep the acting session's browser: Tests  2 failed | 23 passed (25)
CAUGHT  F6 an unlock lifts every locked browser: Tests  4 failed | 21 passed (25)
CAUGHT  F7 a failed lock stops the rest: Tests  1 failed | 24 passed (25)
CAUGHT  F7 a failed sign-out lock stops the rest: Tests  1 failed | 24 passed (25)
CAUGHT  F7 failures are swallowed: Tests  2 failed | 23 passed (25)
CAUGHT  F7 sessions are deleted before the locks: Tests  1 failed | 34 passed (35)
CAUGHT  F7 one listener's failure stops the others: Tests  1 failed | 8 passed (9)
CAUGHT  F8 a forget does not stop a reconnect in flight: Tests  1 failed | 24 passed (25)
CAUGHT  F8 a rotation goes on after its trust ended: Tests  1 failed | 12 passed (13)
CAUGHT  F9 disabling a person leaves their sessions: Tests  2 failed | 51 passed (53)
CAUGHT  F10 attempts are not limited: Tests  1 failed | 3 passed (4)
CAUGHT  F10 the recheck is not under the limit: Tests  1 failed | 34 passed (35)
CAUGHT  F11 a rotation keeps the old key pair: Tests  1 failed | 24 passed (25)
CAUGHT  F13 a forget by credential ends nothing: Tests  1 failed | 12 passed (13)
CAUGHT  a page speaking during an unlock replaces it: Tests  1 failed | 24 passed (25)
CAUGHT  F16 deleted rows linger: Tests  1 failed | 9 passed (10)
CAUGHT  F16 the unlock store does not ask for it: Tests  1 failed | 17 passed (18)
CAUGHT  a lock leaves the boxes: Tests  7 failed | 35 passed (42)
CAUGHT  any proof lifts a lock: Tests  2 failed | 40 passed (42)
CAUGHT  a credential that does not fit may replace a record: Tests  2 failed | 40 passed (42)
CAUGHT  a box is held without checking the current seal: Tests  1 failed | 41 passed (42)
CAUGHT  confirming leaves the other generation: Tests  1 failed | 66 passed (67)
CAUGHT  a rotation drops the generation the browser still holds: Tests  1 failed | 41 passed (42)
CAUGHT  a slid life re-holds and cuts a call in flight: Tests  1 failed | 41 passed (42)
CAUGHT  a deleted key's box stays: Tests  1 failed | 41 passed (42)
CAUGHT  release leaves memory held: Tests  2 failed | 40 passed (42)
CAUGHT  a first-start explanation is said every time: Tests  1 failed | 41 passed (42)
CAUGHT  a sign-out does not say why: Tests  2 failed | 40 passed (42)
CAUGHT  a reset is not told: Tests  2 failed | 40 passed (42)
CAUGHT  a wrap is not bound to its holder and person: Tests  13 failed | 29 passed (42)
CAUGHT  a timer cannot count 60 days: Tests  2 failed | 40 passed (42)
CAUGHT  a long unlock ends at the first stretch: Tests  2 failed | 40 passed (42)
CAUGHT  a paired browser's unlock is offered to others: Tests  1 failed | 24 passed (25)
CAUGHT  a session's end is not told by digest: Tests  4 failed | 14 passed (18)
CAUGHT  a whole person's end does not lock: Tests  1 failed | 17 passed (18)
CAUGHT  a reset does not lock: Tests  1 failed | 17 passed (18)
CAUGHT  custody does not end the old generation on confirmation: Tests  1 failed | 17 passed (18)
CAUGHT  the wait runs inside the attempt's deadline: Tests  2 failed | 7 passed (9)
CAUGHT  a wait is not recorded against its Flow: Tests  1 failed | 20 passed (21)
CAUGHT  one Flow's wait lends time to another: Tests  1 failed | 8 passed (9)
CAUGHT  the setup step does not stop the command: Tests  1 failed | 9 passed (10)
CAUGHT  the setup step is not noted as told: Tests  1 failed | 9 passed (10)
CAUGHT  an old credential stays after confirmation: Tests  1 failed | 16 passed (17)
CAUGHT  the old credential is not kept for a lost reply: Tests  7 failed | 10 passed (17)
CAUGHT  a reconnect does not slide the life: Tests  1 failed | 16 passed (17)
CAUGHT  a request does not slide the life: Tests  1 failed | 16 passed (17)
CAUGHT  a request's write is not throttled: Tests  1 failed | 16 passed (17)
CAUGHT  the view shows a digest: Tests  1 failed | 16 passed (17)
CAUGHT  the client's word confirms nothing: Tests  3 failed | 14 passed (17)
CAUGHT  using the old credential confirms the new: Tests  1 failed | 16 passed (17)
CAUGHT  F2 a caller may put to the unlock store: Tests  1 failed | 21 passed (22)
CAUGHT  F2 a caller may delete from the unlock store: Tests  1 failed | 21 passed (22)
CAUGHT  F2 a forged row is offered to choose: Tests  1 failed | 24 passed (25)
CAUGHT  F12 a session confirms what it was not sent: Tests  1 failed | 12 passed (13)
CAUGHT  a password that opened nothing lifts a lock: Tests  1 failed | 41 passed (42)
CAUGHT  F4 a previous credential past its window is not a reuse: Tests  1 failed | 13 passed (14)
CAUGHT  a paired caller may fall back to the person's other unlocks: Tests  1 failed | 17 passed (18)
CAUGHT  F14 the background does not apply the gate: fail 1
CAUGHT  F14 connect is open to any sender: fail 1
CAUGHT  F14 resetSession is open to any sender: fail 1
CAUGHT  F14 storage stays open to content scripts: fail 1
CAUGHT  F14 any value may be kept for a content script: fail 1
CAUGHT  F14 the content script reads storage itself: fail 1
CAUGHT  F13 an undelivered forget is not kept: fail 2
CAUGHT  F13 an error from Core counts as heard: fail 1
CAUGHT  F13 a kept credential outlives itself: fail 1
CAUGHT  F13 a kept credential is kept after delivery: fail 2
CAUGHT  F13 the person is told it worked when it did not: fail 1
CAUGHT  a browser is not named: fail 1
CAUGHT  F3 a wrong password at approval still pairs: Tests  1 failed | 6 passed (7)
CAUGHT  F3 a wrong password is not checked: Tests  1 failed | 6 passed (7)
CAUGHT  F3 the password at approval unlocks nothing: Tests  1 failed | 6 passed (7)
CAUGHT  F3 approval unlocks more than the browser approved: Tests  1 failed | 6 passed (7)
CAUGHT  F13 a forget needs no credential: Tests  1 failed | 2 passed (3)
```

Earlier guards that no longer exist as such, because their code is gone: "a lock does not stop a live unlock
re-seeding it" (no seeding exists; "a new holder starts unlocked" replaces it) and "a rotation keeps the lost
reply's wrap" (a record holds one pending generation, so it cannot). "Presenting the old one stretches its bound"
was not re-run, because the line it broke changed shape; `credential-lifetime`'s bound test still pins it.

**Checks,** after the last source edit, named paths only. The last source edit was the pairing dialog's 2FA box; the tests whose files changed after the 110-file run were re-run after it (`credential-unlock-proofs`, `credential-unlocks`, `crypto`, `credential-reuse`, secret-keys `handlers`, `sensitive-stores`: Tests 101 passed (101)), as were the web routes, and the browser check ran once more on the final build.

```text
core libraries build     -> Done, all four
core structure audit     -> structure-audit: passed (497 warning(s), 1097 baselined).
fluxiq check             -> build-cache stored, no error TS
ui-components check      -> no error TS
web check                -> no error TS
websocket check          -> no error TS
contracts check          -> no error TS
extension check          -> no error TS
test-runner check        -> no error TS
extension structure audit-> structure-audit: passed (235 warning(s), 553 baselined).
core narrow tests        -> 110 files by subject: Tests 1132 passed | 2 skipped (1134)
contracts tests          -> Tests 91 passed (91)
websocket tests          -> Tests 183 passed (183)
ui-components tests      -> Tests 58 passed (58)
web route tests          -> Tests 57 passed (57)
extension tests          -> # tests 544, # pass 544, # fail 0
Lab tests                -> # tests 68, # pass 68, # fail 0
headed browser           -> 12 of 12 checks true, network guard no violations
```

No full suite ran, by the twice-a-day rule, and no paid call or Lab launch through `pnpm lab`.

## What could end a task during a wait of hours

The rule is that a task ends only with its result or its budget gone. Traced from the wait upward.
**None of these is in my paths, so all are named for the Exploration lane, unfixed.** Each fix is to read
`automationStudioPersonWaitClock.clock({ projectId, flowId })`
(`runtime/models/secrets/person-wait-clock.ts`), which stands still while that Flow waits, and only
that Flow, so a person who never returns lifts nobody else's limit. It is built, tested and recorded
by every wait, with no reader yet.

| Clock | Where | Limit | What happens during a wait | Fix |
| --- | --- | --- | --- | --- |
| **A project build's whole time** | `runtime/project-agents/supervisor/supervisor-loop.ts` (`startClock`), `loop-limits/project-build-duration.ts` | 30 minutes, work stops at 25 | Timers abort the signal the wait is on. **Ends the task**, reported as out of time | Timers cannot pause: re-arm them for what is left when a wait ends, or check the paused clock when they fire and re-arm |
| **A Flow build's time** | `loop-limits/flow-bootstrap-evidence-loop.ts` (`maxDurationMs`), read by `llm/evidence-loop.ts` and `flow-authoring/bootstrap/unfinished-build/phases.ts` | 9 minutes | No abort, but on waking the budget reads as spent. **Ends the task**, reported as out of time | Set `budget.now` and `phases`' `input.now`, built in `automation-service/service.ts`, which I may not touch |
| **A recovery's time** | `adaptation/recovery/recovery-deadline.ts`, `annotation/annotate.ts` | 10 minutes | Same as the next row: it is what caps it | Start the deadline on the paused clock |
| **An exploration's time** | `adaptation/recovery/exploration-budget.ts` (`arm`) | 10 minutes at most | A timer aborts the signal the wait is on. **Ends the recovery** as `budget_exhausted` | Re-arm on the paused clock; it already takes a `now` |
| **A result check's deadline** | `result-verification/deadline.ts`, `build-test/judge.ts`, `run-outcome.ts` | 120 seconds or more | The race settles `timed_out`, so the run ends **unjudged**. Worse, the judge goes on waiting behind it, and **on an unlock it spends a model call nobody reads** | Give the judge a signal the deadline aborts, and do not count held time |
| **A child Flow's bound** | `engine/automation/composite/child-bounds.ts`, `boundary.ts` (`deadlineAt`) | The child's own `timeoutMs` | A model call made inside a bounded child is aborted. **Ends that child** | Only reached by a repair inside a composite. Worth checking whether one can be |
| **A workspace being evicted** | `apps/web/src/lib/workspaces/instance-busy.ts` (hosted, LRU) | When over 100 instances | A waiting task is busy only through a gateway session or a project database. With the browser closed and tracing off, it can read as idle, and eviction closes the instance under it. **Ends the task** | Count work in `activity()`, or a wait |
| **A Core restart** | Everything | Any deploy | An in-flight build is in memory, so it is lost, as it always was | Not a clock. Needs durable tasks |

Checked and fine: an attempt's 45 seconds and the retry budget (held time is outside both); the chat's 24-second
reading (a locked key falls back to the offline reading); a host lease (no time limit, though **a waiting build
keeps others queued behind it on the same host**); gateway commands' 30 seconds; the event-writer lease; parked
runs. **A page after hours is not a clock, but it is real:** the site's own session may have ended, which lands in
the ordinary retry path.

## Not verified

- **A task waiting and resuming in a real browser.** The browser run makes no model call. The wait is proved at the
  provider seam, and its thread sentence only with a fake host.
- **Long waits end to end.** The clocks table is from reading the code.
- **In the browser:** Firefox, the several-browsers list, a wrong password in the dialog, the dialog's 2FA box (typechecked only; it shows for an account with 2FA once a password is typed), and a Forget with Core down
  (proved by tests against the real gateway and a fake fetch). The sender gates in `background/index.ts` are proved
  by a unit test of the decision and a check of the source's order, not by a real content script trying.
- **A panel session really expiring** in the browser: 12 hours. Proved in tests with a clock.
- **A real socket dropping as the credential is sent.** Simulated by a browser coming back with its old credential.
- **The full suites,** by the twice-a-day rule. The next sweep should run: this touches the retry seam, identity,
  the database manager and SQLite options.
- **The hosted path:** by reading only. Windows only.
- **The saved-Flow replay and perturbation lanes** after the Lab's approval change: their pairing tests pass, but I
  did not run them. The demo workspace's dialog fill is typechecked only.

## Open questions or contradictions found

1. **For you: the clocks above.** The hard rule stands unmet there until the lane adopts the clock. I recommend the
   project build's and Flow build's first: they end the commonest tasks. The result check's orphaned spend is the one
   that costs money.
2. **The "Loading the conversation..." after re-pairing** with no project selected, above. Not investigated.
3. **An Automations Run with a locked key** still runs deterministically, with no repair and no word of why, as it
   did. It may deserve a line.
4. **Mid-call race.** The wait is checked just before an attempt. A lock landing between that check and the release
   inside the attempt still raises `secrets.locked` for that one call. Small window.
5. **After a reset, the panel's Unlock form** cannot help, because no password opens the key, and it says only "That
   did not unlock your keys". The chat's line says to add it again, which is right.
6. **The review's two open questions** (does a password change lock browsers, and the wording of the one proof at
   first start) were decided by you as lead, not by Aiden. I have not recorded either as his.

## Note for the lead: `hosted-production-plan.md`

These lines are yours to edit, and are now out of date:

- **Lines 51-54 (S5):** "Resolve the user's live unlock on each call, else a typed `secrets.locked`" becomes: a paired
  browser resolves its own unlock, which lasts as long as its credential once its person has proved themselves for it
  (`programs/secret-keys/runtime/unlocks/`); a call whose key is locked waits for the person; `secrets.locked` remains
  only where nothing can wake it.
- **Lines 425-426:** `approvingSessionId` is no longer audit only. Its digest is what links a browser to a sign-out.
- **Line 427:** "Rotates on every connect (sliding 60 days); the previous one stays valid once for 2 minutes. Presenting
  an older one revokes the browser, audits it and emails the owner" becomes: the previous one stays valid until the new
  one is confirmed in use, at most 14 days; presenting a retired one revokes the browser and audits
  `credential.reuse_detected`. The revoke and the audit are built. **The email is not**, and `client-connected` and
  `credential-reused` at `platform.md` line 709 are the templates lane D would send.
- **Lines 579-586 (Unlock):** "H2 adds a browser-held unwrap key" is done, without a new secret in the browser. "After a
  restart or a key's own expiry, one message covers every locked path" no longer holds for a restart. "The panel offers
  a re-unlock with the password" is now built, and names the browser.
- **Line 584:** "a logout during a build no longer fails it while another unlock lives" changes for a paired browser: it
  uses only its own unlock, and waits.
- **Line 585 (N4):** the sentence is now "Unlock your model key: open app.getfluxiq.com and enter your password once".
- **Lines 738-741:** "a restart, deploy or eviction locks every key and users sign in", and "Unlock after restarts: users
  sign in again after a deploy until H2; announce and drain", no longer hold.
- **Row 10 and line 571:** "Decrypted keys exist only in memory for that user's unlocked sessions" stays true, with one
  addition: wrapped copies are at rest, opened by the holder's credential.
- **The operator's kill switch** `revoke-all-browser-credentials` should also forget their stored unlocks.
  `revokeTrustedClient` already does, so build it on that.
