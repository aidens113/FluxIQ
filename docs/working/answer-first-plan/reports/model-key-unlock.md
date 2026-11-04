# A person's model key stops locking in normal use (t865)

## Outcome

**Round 4: the two high findings and everything else the reviewer's re-run left open are fixed, and I ran each of its attacks as it describes them; each now fails.** My last report said "all sixteen fixed" and that did not hold: my test of the stolen credential moved the clock past the part that failed. This time the tests run the sequence as it really goes, and a real browser ran it too. **A real headed browser went through all of it with no model call, and 18 of 18 checks held,** including a copy of the credential being caught when the browser reconnected by itself, the open panel showing the Unlock step with nothing reopened, and a chat opening with no project chosen.

Three things to know:

- **The hard rule is still not fully met on the older build path.** An attempt's own clocks now leave out a locked key's wait. The limits above a model call on the non-attempt path still read a wall clock; they are listed below for the Exploration lane.
- **What I did not fix, and why, is in "What remains".** Direct writes to the database file are out of scope by your decision. Firefox has no access level for storage.
- **None of this is reviewed yet.** The reviewer attacks it again after this.

## When a person is asked for a password

After setup, a normal person is not asked again. Held by tests, and seen in a real browser for the restart.

**Asked, once each:**

1. **Pairing a browser.** The approval dialog has an optional password box. Filled, that browser is done for good. Left empty, it pairs fine, and the browser's own Open FluxIQ leads to one Unlock with its name on it.
2. **A browser already paired when this ships.** The same one-time step, from the browser.
3. **After signing out of FluxIQ,** for the browser that sign-out locked, when they next want it.
4. **After an administrator ended their session, or all their sessions were ended.**
5. **After changing their password,** for each other browser, and they sign in again anywhere else, since those sessions end.
6. **Re-pairing:** after Forget, after 60 days unused, or after a copy of the credential was caught. Same as 1.
7. **Signing in to the FluxIQ panel,** as always. That is sign-in, and it does not reach a locked browser.

**Told to add the key again, because no password can open it:** after a password reset nobody proved the old password for.

**Never asked:** a Core restart or deploy, a reconnect, a panel session expiring, a credential rotating, a key added or rotated, and never in the middle of a Flow: a task that finds its key locked waits, says so on its card, and carries on by itself after the unlock. The proof is what sign-in asks: a password, and the 2FA code where one is set. Never a PIN.

## What now holds, finding by finding

Rows marked **round 4** changed since the reviewer's re-run. Each proved attack is a permanent test, and I saw each fail first against the code the reviewer attacked, except where "Commands" says otherwise.

| # | What now holds | How | Permanent test |
| --- | --- | --- | --- |
| F1 | A Flow's standing result check can only draw on a session of the person who authorized it, and no client write can set that authorization | The reveal refuses a paired handle. Settings patches and whole-Flow saves keep what is stored. A paired unlock is held under a random per-process handle | `reveal-holder`, `stored-check-authorization`, `flow-check-authorization`, `credential-unlock-proofs` |
| F2 | A stored row earns nothing by being there | One list of sensitive stores. The unlock store is read only after a recheck and written only by its owner. Only a holder the host vouches for is boxed to, failing closed with no answer bound | `sensitive-stores`, database-manager `handlers`, `credential-unlock-proofs`, `runtime-credential-unlock` |
| F3 | A new browser gets the key only on a proof from its person | No seeding. Optional password at approval, otherwise the one-time step. A reset drops live unlocks. Setting someone else's password ends their sessions | `credential-unlock-proofs`, `runtime-credential-unlock`, approve-pairing `route` |
| **F4, round 4** | A credential of a client's that is no longer its own ends the trust the moment it is seen, for whoever holds what | A credential names its client and is signed under a key only that client's record holds, so nothing is remembered per credential and there is no list to get past. A hello is never excused. A request just after a move is only refused, because one can be in flight. Approving the same client id again ends what that person trusted before. An unsigned credential merely naming a client ends nothing | `credential-reuse` |
| **F5, round 4** | A proved password change keeps only what the acting session holds | Other browsers lock with `password_changed`, as a setup step. Every other session of the person's ends. Work one of those sessions started cannot fall back on the person's other unlocks; a plain sign-out still can, as before | `credential-unlock-proofs`, `runtime-credential-unlock`, identity `service` |
| F6 | An unlock lifts only what the person chose | `unlock` takes `clientIds`, and naming none lifts none. See F18 for what the page offers | `credential-unlock-proofs`, secret-keys `handlers` |
| **F7, round 4** | A failed write does not leave the rest unlocked, and a refused lock is written once the store takes writes | Every holder is attempted, memory goes first, failures are raised together, locks are written before a session is deleted, and a lock the store refused is tried again at each next presentation | `credential-unlock-proofs`, `session-revocations`, identity `service` |
| F8 | A revoke during a reconnect stands | The trust is checked again after each wait, and a holder forgotten in this process cannot come back from a presentation in flight | `credential-reuse`, `credential-unlock-proofs` |
| F9 | Disabling a person locks them | `updateUser` going from enabled to disabled ends their sessions | identity `service`, `runtime-credential-unlock` |
| **F10, round 4** | Guesses sent together cannot all run, and someone else's guesses do not hold a person back | Counted as they start, per session, so 200 together run at most 8. A stolen session's guesses hold back that session only, and a fresh sign-in is always a way out | `credential-attempts`, identity `service` |
| F11 | An old credential with an old row copy opens nothing written since | A rotation writes a whole new key pair beside the old, promoted on confirmation | `credential-unlock-proofs` |
| **F12, round 4** | A confirmation promotes only the generation written for that credential | A confirmation names its credential by digest. A generation written ahead for a reconnect still in flight stays until its own credential says so | `credential-unlock-proofs`, `credential-reuse`, `credential-custody` |
| F13 | A person is never told a trust ended when Core has not heard | Forget tries the socket, then a credential-authorized route, then keeps it for the next chance and says so | `forget-delivery`, `forget-outcome-words`, forget-pairing `route`, `credential-reuse` |
| F14 | In Chrome and Edge, a content script can neither read the credential, nor send it elsewhere, nor end its trust | `connect` and `resetSession` are control-page-only. Local storage is closed to untrusted contexts. See "What remains" for Firefox | `credential-messages`, `overlay-placement`, `placement-memory` |
| F15 | Dead holders take nothing, and a client with no row is locked | Vouching, and rows start locked | `credential-unlock-proofs` |
| **F16, round 4** | A deleted row is overwritten in the file and leaves the write-ahead log | `secure_delete`, and a checkpoint after a delete, tested with another connection open. See "What remains" for a connection mid-read | `sqlite-repository`, `runtime-credential-unlock` |
| **F17, new** | Nobody writes what proves who a person is by hand, and a lift does not stand on a password that opened none of a person's keys | `credential:` and `session:` rows of `identity.users` refuse put and delete, recheck or not. Identity reads a row by what it says it is, so a row saying it is one of those is refused under any id. A lift needs a password that opened something, unless the person has no sealed keys or a reset is on record | database-manager `handlers`, `credential-unlock-proofs` |
| **F18, new** | A browser nobody has ever unlocked is not offered from a page at all, only from itself | Its Open FluxIQ carries a ticket only it can read. `unlock` refuses to lift it without that ticket, and the page without one only says it exists, when it was paired, and how to revoke it | secret-keys `handlers`, `unlock-offer`, `open-purpose`, seen in a browser |
| **F19, new** | One attempt's limits are lifted only by its own waits | An attempt listens to its own provider rather than a clock shared by Flow. `personHeldMs` on the attempt's ports is gone | `ports`, `person`, `session-key-provider` |

## The three that were not about attacks

- **A locked key now shows on the attempt.** A provider says of its own calls when they start and stop waiting (`observeHolds`). An attempt sets `waiting_for_person` / `model_key_locked` on its stored row while that lasts, and clears it when the wait ends. It resumes by itself, because the wait sits before the call. Tested with a real scripted attempt (`person.test.ts`). `interrupted` is untouched, for t870.
- **An already-open side panel shows the Unlock step on its own.** An empty chat reads the key again as it polls, at least every 15 seconds while it reads fine. Seen in a real browser: the open panel showed "because you signed out" with nothing reopened. A chat that already has turns does not show the line; the person learns when they ask, from the setup-step reply, and a running task from its card.
- **"Loading the conversation..." was real, and worse than I reported.** I said "about a minute"; I had only looked at two moments. Watching it at 3, 15, 30 and 60 seconds after re-pairing with no project: the person sees "Loading the conversation... This chat isn't updating: finding this chat in FluxIQ failed (FluxIQ hasn't said which project this browser belongs to). Retry", for good, with nothing they can do from there. It happens when Core has no active project for them, as after a Core restart with no panel open on a project. It would also meet a first-time person who has none. **Fixed:** when the panel has chosen none, a paired browser works in the person's latest project in its domain, or a first one called "My automations" if they have none (`lib/paired-client-project.ts`). A panel's choice still wins.

## Running the reviewer's attacks myself

Each as its re-run describes, on the final code. "Caught" means the attempt fails as it should.

| Attack | How I ran it | Result |
| --- | --- | --- |
| F4, the grace | A copy of the current credential says hello and confirms; the real browser comes back a second later, in a test and with no clock moved. Also in the headed run, over a real socket, with the browser's own automatic reconnect | **Caught.** Trust revoked, both refused, `credential.reuse_detected` audited with the client id. In the browser: it went to pairing, and every trust read revoked |
| F4, the flush | The copy moves on 40 times, then the original comes back 10 minutes later, and across a restart | **Caught.** There is no list to get past |
| F4, step 3 | The same person approves the client id again | **Caught.** The earlier trust ends. Another person's is left alone |
| F4, a forged credential (mine) | A credential naming a client, unsigned or badly signed, on a hello and a request | **Ends nothing,** as it must not |
| F17, as one run | Through the real registry and identity: put of a credential row under its own id, under other ids, with spaces and other case; delete of credential and session rows; then sign-in as the person with the chosen password | **Caught.** All refused after a real recheck; the sign-in fails |
| F17, the lift | A verified unlock with a password that opens none of a person's sealed keys, naming a browser; then their sign-in | **Caught.** The lock stays, and no box is written |
| F5 | Two sessions; a proved change on one; then the other's own work, through the host's own resolver | **Caught.** That session is invalid, and what it started draws on nothing. The acting session keeps its key |
| F18 | A cookie pairs a browser under "Chrome on Windows"; then the page, and `unlock` naming it with the right password | **Caught.** The page has no Unlock for it (seen in a browser), and `unlock` answers `stillLocked` |
| F10, the burst | 201 rechecks together on one session, the right password among them | **Caught.** 193 held back, 8 ran |
| F10, held back | 9 wrong guesses on another session, then the person's own `set-password` | **Caught.** Their change goes through |
| F7 | The store refuses a lock's write, then takes writes; a restart | **Caught.** The next presentation writes it, and the restart reads locked. With a store that keeps refusing, it still reads unlocked: see "What remains" |
| F12 | A confirmation of the current credential while another's generation is written ahead; then a lost reply | **Caught.** The generation is not promoted, and the accepted credential still opens |
| F16 | A real file, another connection open, a delete, then every file scanned | **Caught.** The marker is in no file. A connection mid-read was not run: see "What remains" |
| F19 | Someone else's open wait on the same Flow, read by an attempt's limit | **Caught.** It lends nothing |
| F2 residual | Not run again. Out of scope by your decision | Stated |
| F14 | Not attacked in Firefox | Stated |

## Decisions I made beyond your list, for the reviewer

1. **The credential's signature.** You asked for the trust id in the token. With only that, anyone who knows a client's public id could end its trust by inventing a credential naming it, and that id is listed to `programs.read`. So a credential also carries an HMAC under a key on the trust record, and an unsigned one is noise. That key is in `trusted-clients.json`: a file reader could forge a revoke, which is a nuisance, and could not forge a credential, since the digest must still match.
2. **"Approved again" is limited to the same person.** A client id is whatever a client says. If any approver ended any trust with that id, one member could unpair another's browser by saying its id. Under another person's approval the old trust stays, and detection still covers it.
3. **F18 goes further than the reviewer's smallest fix.** It proposed a list with a warning, which still lets a person tick a thief's browser. I took your "must not be offered without the proof" as a proof the browser is theirs: the ticket. It costs a person nothing extra: they press the Open FluxIQ they were already pressing. A thief can still send someone their own link; the person would have to follow it and enter their password. A browser unlocked before keeps the one-click named button, your round-3 decision, with its last use shown. The reviewer called that a nudge for a lost laptop, so you may want to change it.
4. **The limiter is per session, not per person.** That is what stops a stolen session holding the person back. The cost: guesses are limited per stolen session, and a person's own session, if that exact session was stolen, is held back until they sign in again.
5. **Work started by a session a password change ended cannot fall back.** The reviewer's F5 attack went through the fallback, so ending the session alone would leave a run already going. A plain sign-out keeps the existing behaviour, which a test pins.
6. **A generation written ahead now survives a confirmation of the credential before it,** until the next rotation replaces it. It needs a credential nobody received to open.
7. **A first project is created for a person with none,** by the bearer snapshot, on first need. Tell me if you would rather the chat asked.
8. Round 3's stand: no PIN on unlocking and approving; the unlock store refuses a caller's put and delete; `save-flow` is stripped too; the Lab's approval sends the password, and the demo workspace fills the dialog's box.

## What remains after these fixes

- **F2, someone who can write the database file directly. Out of scope, your decision: that attacker already owns the machine.** Reading alone still opens nothing.
- **F7, a store that refuses a lock's write and keeps refusing until a restart.** Then that row reads as it was. A durable record of the lock would need the same store, which is the one refusing. The person's next sign-out or revoke tries again, and the failure is raised at the time.
- **F14, Firefox has no `setAccessLevel`.** There a content script can still read `storage.local`; the sender gates are what stand. A small fix does not exist: moving the credential to the extension's IndexedDB for one browser is a storage migration I could not test here. Needs a compromised renderer.
- **F16, a connection in the middle of a read when the row is deleted** holds up the checkpoint, so the row stays in the log until the next one. An idle connection does not. A row overwritten rather than deleted stays in the log until SQLite's next checkpoint. Either still needs the credential to open.
- **F13, a socket that has half-closed** can read as told. The reviewer's note, believed, low. Not fixed.
- **F18, a thief's own link.** Above.
- **A chat with turns** does not show the Unlock line until the person asks.
- **Credentials from before this change** carry no signature. Such a client gets its key on its next reconnect. A copy of an older one is simply unknown, as before.
- **A browser restored from a backup** presents an old credential and pairs again, as the reviewer said it should. So does restoring Core's trust store from a backup.
- **An operator controlling the running process** can do what they always could.

## The design, in short

Each holder has an X25519 key pair. Data keys are boxed to the public key; the private key is wrapped under a key derived from the credential (HKDF-SHA256, AES-256-GCM), bound to holder, person and record. So a key the person adds while a browser is away still reaches that browser, and reading the store opens nothing. `docs/architecture/platform.md`, "An unlock lasts as long as its credential", is the current description.

A paired credential slides: 60 days from last use, renewed by every reconnect and request. The one before the current stays valid until the new one is confirmed, at most 14 days, so a lost reply strands nobody. Every sentence about a locked key comes from `modelKeyLockedWords`.

## Paths outside the brief's owned list

Earlier rounds' list stands. New this round: `framework/automation-service/service/answer-first/attempt/` (`key-wait.ts`, `run-attempt.ts`, `state.ts`, `keep.ts`, and `ports.ts`, removing what you added for `personHeldMs`, as your F19 decision allows), `runtime/llm/domain-instructions/provider.ts`, `runtime/models/contracts/provider.ts`, `packages/ui-components/src/chat/chat-widget.ts`, `apps/web/src/lib/paired-client-project.ts` and the snapshot route, `apps/web/src/features/programs/live-views/secret-keys-unlock/`, and the extension's `background/panel/`.

`framework/automation-service/service.ts`, `runtime/llm/evidence-loop*`, `.structure-baseline.json`, `package.json` versions, `fxlab/` and both shared checkouts are untouched.

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
| Pairing with no password given | Every pairing | Used the live unlock | **Locked, with the one-time step from the browser** |
| Forget this pairing, online | Whenever | Core kept the trust | Trust ends, record deleted |
| Forget this pairing, offline | Whenever | Core kept the trust, silently | Delivered when it can be, and the person is told until then |
| Administrator revokes the session or the browser | Rare | Locked, if this process knew the raw id | **Locks,** by digest, after a restart too |
| Every session revoked; disabled or deleted, by any path | Rare | Locked by provisioning only | **Locks,** including `update-user` |
| Key deleted | Rare | Locked for that key | **Locks** for that key |
| Password reset with no old password | Rare | Keys unreadable | **Locks,** live unlocks go too, keys stay unreadable |
| Someone else sets a person's password | Rare | Their sessions lived on | **Their sessions end** |
| Password change, proved | Rare | Other sessions kept it | The acting session and its browsers keep it; **others lock,** and other sessions end |
| A credential the client has moved on from, presented | Rare | Refused, indistinguishable from noise | **Trust revoked,** audited by client |
| The same client approved again by the same person | Rare | Two trusts | **The earlier one ends** |
| Credential life running out | **Monthly**, fixed at 30 days | Pair again | 60 days from last use |
| Rotated credential never delivered | Rare | Pair again | The old one still works, up to 14 days |

## The threat model, in plain words

On Core's disk per holder: a public key, a private key encrypted under a key only the credential derives, and data keys encrypted to that public key. Core keeps a credential and a panel session only as SHA-256 digests. Rows marked "corrected" were wrong in my last report.

| Attacker has | What they get |
| --- | --- |
| The store, read only (disk, backup) | **Nothing opens.** Tested: no plaintext, and a digest opens nothing |
| The database manager API, with `data.manage` | **Corrected: "the API path is closed" was false, because of `identity.users`.** Now: reading needs a recheck. The unlock store and the rows that prove who a person is cannot be written by hand. Nothing is boxed to a row with no trust behind it. Other rows of those stores still can be, after a recheck |
| Direct write access to the database file | Out of scope by decision. That attacker owns the machine |
| Only a holder's public id | Nothing. It reaches no reveal, and a credential merely naming it ends nothing |
| A panel cookie alone | It can pair a browser, which starts locked and takes nothing, and the person is not offered it. It can guess a limited number of passwords. It cannot unlock anything without the password |
| A current credential alone | **Corrected: my table said a retired credential gets "Nothing", and this was the hole.** No key value. It can speak as that browser and spend through model calls until it is caught, which is the moment anyone presents what the other has moved on from: that ends the trust for both, however often it moved on |
| A credential in the lost-reply window | The same as a current one, for at most 14 days |
| A credential the client has moved on from | Nothing, and presenting it on a hello ends the trust and is audited. On a request within a moment of the move it is only refused |
| The store and a current credential | **Yes, that browser's boxes.** This is the design's boundary. Forgetting or revoking ends it |
| An old credential and an old copy of its row | Only what that copy already held. Later boxes are sealed to a newer key pair |
| Another person's credential | **No.** Tested |
| A password reset nobody proved | No live unlock survives, and a browser paired then takes nothing |
| A disabled person's browser | Locks by every path |
| A forget during a reconnect | It stands |
| A stolen session after the person changes their password | **Corrected.** It ends, and what it started draws on nothing else of theirs |
| A compromised content script | Cannot read the credential in Chrome or Edge, redirect it or end the trust. Firefox: the sender gates only |
| An operator of a hosted deployment, at rest | **No,** as above |
| An operator controlling the running process | Yes, and always could |

**Renewal has no upper bound.** A credential used within every 60 days lasts for ever. That is deliberate: "a browser in regular use never pairs again" is the requirement, and reuse detection is what covers a stolen one.

**Rotating an API key, said plainly.** The new value reaches the rotator's own unlocked browsers. So if a browser was compromised, rotating alone does not lock it out: **forget that browser first, then rotate.** A password change does lock the others.

**Hosted deployments use the same design.** Records live in each workspace's own store. Hosted scoping is by reading, not run.

**Logs.** Nothing logs a credential, password or key. Failures name a step and an error type. Buffers are zeroed as `held-keys.ts` does; a JS string credential cannot be, nor a `KeyObject` during a box operation. **Extension storage** holds the credential it always held, plus a pending forget, which is that same credential. The unlock ticket is in the address's fragment only until the page reads it, and is no use without the person's password.

## Commands run and observed results

**Failing first.** Against the code the reviewer attacked, with the new tests in place:

```text
gateway, unlocks, attempts, identity, sqlite -> Tests 14 failed | 89 passed (103)
database-manager, what proves who a person is -> Tests 9 failed | 1 passed | 22 skipped (32)
```

The F5 fallback test, the attempt test and the ticket tests were written alongside their fixes, so the guards below are what show them biting.

**Each guard broken in turn, then restored.** 127 guards were caught one at a time, the first rounds' that still exist and this round's. **On the first pass 3 of this round's were caught by nothing, and those were weak tests:** a wrong-ticket test where no ticket existed yet, so it proved nothing; a "not given to a panel" test where no row was vouched for; and the lock's duration, which the window alone had hidden. I fixed each test and re-ran its guard. 8 more first did not apply, because my new code had changed the line they break; I corrected and re-ran those. Web's ran after a rebuild, since its tests refuse a Core source newer than its build.

One guard is caught only with its partner: "an old credential outlives its bound" passes alone, because reuse detection refuses the same credential first. Breaking both: `(not seen)`.

Guards from earlier rounds whose code is gone: the seeding guards, the retired-digest guards ("forgotten rather than retired", "unbounded", "panel sees retired digests"), and "presenting the old one stretches its bound", which was not re-run because its line changed shape; `credential-lifetime`'s bound test still pins it.

```text
CAUGHT  F1 a reveal draws on a paired browser's unlock: Tests  1 failed | 1 passed (2)
CAUGHT  F1 a client's authorization is kept: Tests  1 failed | 3 passed (4)
CAUGHT  F1 a settings patch is not stripped: Tests  2 failed | 1 passed (3)
CAUGHT  F1 a saved Flow is not stripped: Tests  2 failed | 1 passed (3)
CAUGHT  F1 an unlock is held under its public id: Tests  1 failed | 30 passed (31)
CAUGHT  F2 the unlock store is not sensitive: Tests  3 failed | 29 passed (32)
CAUGHT  F2 a caller may put to the unlock store: Tests  2 failed | 30 passed (32)
CAUGHT  F17 a credential row may be written by hand: Tests  7 failed | 25 passed (32)
CAUGHT  F17 a row may say it is a credential under another name: Tests  2 failed | 30 passed (32)
CAUGHT  F17 a put is not asked: Tests  8 failed | 24 passed (32)
CAUGHT  F17 a delete is not asked: Tests  3 failed | 29 passed (32)
CAUGHT  F17 a lift stands on a password that opened nothing: Tests  1 failed | 30 passed (31)
CAUGHT  F17 a recorded reset no longer allows a lift: Tests  1 failed | 30 passed (31)
CAUGHT  F2 a row with no vouch is boxed to: Tests  3 failed | 28 passed (31)
CAUGHT  F2 an unbound host vouches for everyone: Tests  1 failed | 30 passed (31)
CAUGHT  F2 a forged row is offered to choose: Tests  1 failed | 30 passed (31)
CAUGHT  F2 the host vouches for any row: Tests  1 failed | 18 passed (19)
CAUGHT  F3 a new holder starts unlocked: Tests  6 failed | 25 passed (31)
CAUGHT  F3 a reset leaves live unlocks: Tests  1 failed | 30 passed (31)
CAUGHT  F4 a hello is not checked for reuse: Tests  7 failed | 12 passed (19)
CAUGHT  F4 reuse is not audited: Tests  2 failed | 17 passed (19)
CAUGHT  F4 reuse does not revoke: Tests  8 failed | 11 passed (19)
CAUGHT  F4 a hello gets a request's excuse: Tests  4 failed | 15 passed (19)
CAUGHT  F4 a request in flight gets no excuse: Tests  1 failed | 18 passed (19)
CAUGHT  F4 the lost-reply window counts as reuse: Tests  1 failed | 18 passed (19)
CAUGHT  F4 a previous credential past its window is not a reuse: Tests  1 failed | 18 passed (19)
CAUGHT  F4 merely naming a client ends its trust: Tests  1 failed | 18 passed (19)
CAUGHT  F4 a credential does not name its client: Tests  7 failed | 12 passed (19)
CAUGHT  F4 the panel sees the signing key: Tests  1 failed | 18 passed (19)
CAUGHT  F4 an earlier trust stays when the browser is approved again: Tests  1 failed | 18 passed (19)
CAUGHT  F4 approving ends another person's trust too: Tests  1 failed | 18 passed (19)
CAUGHT  F5 another session outlives a password change: Tests  1 failed | 36 passed (37)
CAUGHT  F5 the session that made the change ends too: Tests  1 failed | 36 passed (37)
CAUGHT  F5 what another session started still falls back: Tests  1 failed | 18 passed (19)
CAUGHT  F5 a sign-out after a change overwrites why it locked: Tests  1 failed | 18 passed (19)
CAUGHT  F3 someone else's password leaves their sessions: Tests  1 failed | 18 passed (19)
CAUGHT  F5 a password change keeps every holder: Tests  3 failed | 28 passed (31)
CAUGHT  F5 a password change leaves other live unlocks: Tests  1 failed | 30 passed (31)
CAUGHT  F5 a change locks without saying why: Tests  1 failed | 30 passed (31)
CAUGHT  F5 a change does not keep the acting session's browser: Tests  2 failed | 29 passed (31)
CAUGHT  F6 an unlock lifts every locked browser: Tests  5 failed | 26 passed (31)
CAUGHT  F7 a failed lock stops the rest: Tests  1 failed | 30 passed (31)
CAUGHT  F7 a failed sign-out lock stops the rest: Tests  1 failed | 30 passed (31)
CAUGHT  F7 failures are swallowed: Tests  2 failed | 29 passed (31)
CAUGHT  F7 sessions are deleted before the locks: Tests  1 failed | 36 passed (37)
CAUGHT  F7 one listener's failure stops the others: Tests  1 failed | 8 passed (9)
CAUGHT  F7 a refused lock is not tried again: Tests  1 failed | 30 passed (31)
CAUGHT  F8 a forget does not stop a reconnect in flight: Tests  1 failed | 30 passed (31)
CAUGHT  F8 a rotation goes on after its trust ended: Tests  1 failed | 18 passed (19)
CAUGHT  F9 disabling a person leaves their sessions: Tests  2 failed | 54 passed (56)
CAUGHT  F10 guesses sent together all run: Tests  1 failed | 4 passed (5)
CAUGHT  F10 the recheck is not under the limit: Tests  2 failed | 35 passed (37)
CAUGHT  F10 someone else's guesses hold back a person: Tests  1 failed | 36 passed (37)
CAUGHT  F12 a confirm promotes what another only wrote ahead: Tests  2 failed | 29 passed (31)
CAUGHT  F12 a named confirm promotes nothing: Tests  2 failed | 29 passed (31)
CAUGHT  F12 a session confirms what it was not sent: Tests  1 failed | 18 passed (19)
CAUGHT  F13 a forget by credential ends nothing: Tests  1 failed | 18 passed (19)
CAUGHT  a page speaking during an unlock replaces it: Tests  1 failed | 30 passed (31)
CAUGHT  F16 deleted rows linger: Tests  2 failed | 9 passed (11)
CAUGHT  F16 a deleted row stays in the log: Tests  1 failed | 10 passed (11)
CAUGHT  F18 the handler lifts what was named: Tests  1 failed | 6 passed (7)
CAUGHT  F18 a ticket for a browser unlocked before: Tests  1 failed | 6 passed (7)
CAUGHT  key wait: a wrapped provider does not say: Tests  1 failed | 8 passed (9)
CAUGHT  F19 a judge's limit counts its own wait wrongly: Tests  2 failed | 3 passed (5)
CAUGHT  F16 the unlock store does not ask for it: Tests  1 failed | 18 passed (19)
CAUGHT  a lock leaves the boxes: Tests  7 failed | 35 passed (42)
CAUGHT  any proof lifts a lock: Tests  2 failed | 40 passed (42)
CAUGHT  a credential that does not fit may replace a record: Tests  2 failed | 40 passed (42)
CAUGHT  a box is held without checking the current seal: Tests  1 failed | 41 passed (42)
CAUGHT  promoting leaves the other generation: Tests  2 failed | 71 passed (73)
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
CAUGHT  a paired browser's unlock is offered to others: Tests  1 failed | 25 passed (26)
CAUGHT  a session's end is not told by digest: Tests  4 failed | 15 passed (19)
CAUGHT  a whole person's end does not lock: Tests  1 failed | 18 passed (19)
CAUGHT  a reset does not lock: Tests  1 failed | 18 passed (19)
CAUGHT  custody does not promote on confirmation: Tests  1 failed | 18 passed (19)
CAUGHT  the wait runs inside the attempt's deadline: Tests  2 failed | 7 passed (9)
CAUGHT  one Flow's wait lends time to another: Tests  1 failed | 8 passed (9)
CAUGHT  the setup step does not stop the command: Tests  1 failed | 9 passed (10)
CAUGHT  the setup step is not noted as told: Tests  1 failed | 9 passed (10)
CAUGHT  an old credential stays after confirmation: Tests  2 failed | 15 passed (17)
CAUGHT  the old credential is not kept for a lost reply: Tests  6 failed | 11 passed (17)
CAUGHT  a reconnect does not slide the life: Tests  1 failed | 16 passed (17)
CAUGHT  a request does not slide the life: Tests  1 failed | 16 passed (17)
CAUGHT  a request's write is not throttled: Tests  1 failed | 16 passed (17)
CAUGHT  the view shows a digest: Tests  1 failed | 16 passed (17)
CAUGHT  using the old credential confirms the new: Tests  1 failed | 16 passed (17)
CAUGHT  F4 a bearer is not checked for reuse: Tests  1 failed | 18 passed (19)
CAUGHT  F10 attempts are not limited: Tests  1 failed | 5 passed (6)
CAUGHT  F11 a rotation keeps the old key pair: Tests  1 failed | 30 passed (31)
CAUGHT  F18 a browser nobody unlocked lifts with no ticket: Tests  1 failed | 6 passed (7)
CAUGHT  F18 a panel is given the ticket: Tests  1 failed | 6 passed (7)
CAUGHT  a password that opened nothing lifts a lock: Tests  1 failed | 41 passed (42)
CAUGHT  a paired caller may fall back to the person's other unlocks: Tests  1 failed | 18 passed (19)
CAUGHT  a wait is not recorded against its Flow: Tests  1 failed | 21 passed (22)
CAUGHT  the client's word confirms nothing: Tests  3 failed | 14 passed (17)
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
CAUGHT  F18 the browser's button carries no ticket: fail 1
CAUGHT  F18 any ticket will do: Tests  1 failed | 6 passed (7)
CAUGHT  F18 the page offers a browser nobody unlocked: Tests  3 failed | 7 passed (10)
CAUGHT  no-project: two polls make two projects: Tests  1 failed | 2 passed (3)
CAUGHT  F18 a client is not told what starts its unlock: Tests  1 failed | 23 passed (24)
CAUGHT  F3 a wrong password at approval still pairs: Tests  1 failed | 6 passed (7)
CAUGHT  F3 a wrong password is not checked: Tests  1 failed | 6 passed (7)
CAUGHT  F3 the password at approval unlocks nothing: Tests  1 failed | 6 passed (7)
CAUGHT  F3 approval unlocks more than the browser approved: Tests  1 failed | 6 passed (7)
CAUGHT  F13 a forget needs no credential: Tests  1 failed | 2 passed (3)
```

**Checks,** after the last source edit, named paths only.

```text
core libraries build     -> Done, all four, after the guards were restored
core structure audit     -> structure-audit: passed (502 warning(s), 1097 baselined).
fluxiq, ui-components, web, websocket, contracts check -> no error TS
extension, test-runner check -> no error TS
extension structure audit-> structure-audit: passed (235 warning(s), 553 baselined).
core narrow tests        -> 115 files by subject: Tests  1229 passed | 2 skipped (1231)
contracts, websocket, ui-components tests -> 91, 183 and 77 passed
web routes, IAM parity   -> Tests  313 passed (313)
extension tests          -> # tests 611, # fail 0
Lab tests                -> # tests 53
headed browser           -> 18 of 18 checks true, no network guard violation, no model call
```

No full suite ran, by the twice-a-day rule, and no paid call or Lab launch through `pnpm lab`.

## What could end a task during a wait of hours

The rule is that a task ends only with its result or its budget gone. **An attempt now leaves its own lock waits out of a judge's deadline and of what its rounds count.** The rest, none in my paths and all for the Exploration lane, unfixed; each fix is to read `automationStudioPersonWaitClock.clock({ projectId, flowId })`. If that lane reads the clock, note it is keyed by project and Flow, so another person's wait on the same Flow would count: key it by caller too, or listen as the attempt does.

| Clock | Where | Limit | What happens during a wait | Fix |
| --- | --- | --- | --- | --- |
| **A project build's whole time** | `runtime/project-agents/supervisor/supervisor-loop.ts` (`startClock`), `loop-limits/project-build-duration.ts` | 30 minutes, work stops at 25 | Timers abort the signal the wait is on. **Ends the task**, reported as out of time | Re-arm for what is left when a wait ends |
| **A Flow build's time** | `loop-limits/flow-bootstrap-evidence-loop.ts` (`maxDurationMs`), `llm/evidence-loop.ts`, `flow-authoring/bootstrap/unfinished-build/phases.ts` | 9 minutes | On waking the budget reads as spent. **Ends the task** | Set `budget.now`, in `automation-service/service.ts`, which I may not touch |
| **A recovery's time** | `adaptation/recovery/recovery-deadline.ts`, `annotation/annotate.ts` | 10 minutes | Same as the next row | Start the deadline on the paused clock |
| **An exploration's time** | `adaptation/recovery/exploration-budget.ts` (`arm`) | 10 minutes at most | A timer aborts the signal the wait is on. **Ends the recovery** | Re-arm on the paused clock |
| **A result check's deadline** | `result-verification/deadline.ts`, `build-test/judge.ts`, `run-outcome.ts` | 120 seconds or more | The run ends **unjudged**, and the judge goes on waiting behind it, **spending a call on an unlock** | Give the judge a signal the deadline aborts. The Flow-less judge already has one |
| **A child Flow's bound** | `engine/automation/composite/child-bounds.ts`, `boundary.ts` | The child's `timeoutMs` | **Ends that child** | Only reached by a repair inside a composite |
| **A workspace being evicted** | `apps/web/src/lib/workspaces/instance-busy.ts` | Over 100 instances | A waiting task can read as idle. **Ends the task** | Count a wait in `activity()` |
| **A Core restart** | Everything | Any deploy | An in-flight build is in memory, so it is lost | Needs durable tasks |

## Not verified

- **A task waiting and resuming through a real model call in a real browser.** No model call this round. It is proved with a scripted attempt and with the real session-key provider, separately.
- **In the browser:** Firefox, the several-browsers list, a wrong password in the dialog, the dialog's 2FA box, a Forget with Core down, a real panel session expiring.
- **The sender gates** against a real content script: a unit test of the decision and a check of the source's order.
- **The clocks table** is from reading the code. **The hosted path** is by reading. Windows only.
- **F16 on a running host** with its real connections.
- **A first project being made in a real browser:** the Lab already has a project, so that branch is unit tested.
- **The full suites,** by the twice-a-day rule. This touches the retry seam, identity, the database manager, SQLite options, the gateway's credential format and an attempt's state.

## Open questions or contradictions found

1. **For you: the one-click named button for a browser unlocked before.** Your round-3 decision stands; the reviewer's point about a lost laptop is fair.
2. **For you: a first project made automatically** ("My automations"), above.
3. **For you: the clocks above,** on the non-attempt path.
4. **My "about a minute" and "all fixed" were both overstatements,** corrected here.

## Note for the lead: `hosted-production-plan.md`

These lines are yours to edit:

- **Lines 51-54 (S5):** a paired browser resolves its own unlock, which lasts as long as its credential once its person has proved themselves for it; a call whose key is locked waits for the person; `secrets.locked` remains only where nothing can wake it.
- **Lines 425-426:** `approvingSessionId` is no longer audit only. Its digest is what links a browser to a sign-out.
- **Line 427:** the previous credential stays valid until the new one is confirmed in use, at most 14 days; presenting one the client has moved on from revokes the browser and audits `credential.reuse_detected`. The revoke and the audit are built. **The email is not;** `credential-reused` at `platform.md` line 709 is the template lane D would send.
- **Lines 579-586 (Unlock):** "H2 adds a browser-held unwrap key" is done, without a new secret in the browser. "The panel offers a re-unlock with the password" is built, and names the browser. A browser nobody has unlocked starts from itself.
- **Line 584:** a paired browser uses only its own unlock, and waits.
- **Line 585 (N4):** the sentence is now "Unlock your model key: open app.getfluxiq.com and enter your password once".
- **Lines 738-741:** "a restart, deploy or eviction locks every key and users sign in" no longer holds.
- **Row 10 and line 571:** add that wrapped copies are at rest, opened by the holder's credential.
- **`revoke-all-browser-credentials`** should build on `revokeTrustedClient`, which forgets stored unlocks.
