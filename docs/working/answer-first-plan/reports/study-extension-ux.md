# Study: the extension's user experience today, and what it must become

Read at extension `dev` bb241caf and Core `dev` 769fd499b, 2026-11-03. No code, Lab, browser, provider, panel or test ran.

**Path keys.** `P/` = `apps/extension/src/panel`, `B/` = `apps/extension/src/background`, `U/` = `!FluxIQ/packages/ui-components/src/chat`, `R/` = `!FluxIQ/packages/fluxiq/src/runtime`.
**Marks.** **[S]** seen in a saved screenshot. **[C]** read from code. **[I]** my inference.
**Screenshots** (under `lab-runs/`, all Chrome side panel with the E2E build): **A** `2026-11-03/run-mw0l0e9y` (passed), **B** `2026-11-03/run-mw0jw263` (failed at its result), **D** `2026-11-03/run-mw0hzrhs` (first run failed), **E** `2026-10-31/run-mvx83b7v` (result not confirmed), **F** `2026-11-01/run-mvy8n92p` (no steps built). Number = screenshot sequence.

## Outcome

1. **A person who succeeds today does not get what they asked for.** Run A found the right 10 rows. Its chat ends with a card saying "10 rows came back" and then "Run finished" (A 27). The rows are not in the chat. They are four presses away, as a CSV.
2. **The chat tells the story of building a Flow, not of doing the person's task.** "Building your Flow", "Changing the Flow", "Testing: Read list", "Judging the Flow", "Records saved" (A 06, 10, 19, 27). The new product needs the opposite order: the task's answer first, the Flow as a by-product.
3. **Failure is the common case and it reads worst.** Lab index since 2026-10-30: 2 of 14 passed (`discovery.md`, Outcome 5). B 34 ends in machine prose cut off mid-sentence. D 20 says "ready", then "Run failed" with no cause and a raw code.
4. **There are four setup stops outside the extension.** Run FluxIQ, sign in, approve the browser, add a model key. All are in the web panel, and the extension does not explain how to do them.
5. **Much of the fix can start now.** The chat already has seams for this: `ChatAttachment` on a turn, `ChatAttachmentPort`, `ChatAskPort`, and `threads`. The extension passes none of the option-based ones today (`P/chat/chat-panel.ts:59`). An answer turn, a meter and a task list can be built against fake ports before Core's work lands.

**Evidence gap, read this first.** No saved screenshot shows the getting-started steps, the onboarding empty state, the Automations tab, the strip, Settings, recording, extraction, or Firefox. The Lab pairs before its first picture and goes straight to typing. Those steps are read from code only.

---

## 1. The journey today

**1. Install and first open.** Manifest says "Record, run and repair browser automations... Connects only to the FluxIQ runtime you run and pair". The toolbar button opens the side panel (`B/index.ts:339`, `B/extension-installed.ts:19`). No welcome page opens. [C]
- Confusing: the store text leads with recording, while the product now leads with asking. The panel opens in a column beside whatever tab is active, with no sign of what to do beyond getting-started.

**2. Getting started, pairing, signing in.** Three numbered steps replace the chat: 1 Open FluxIQ, 2 Connect this browser, 3 Approve it in FluxIQ, with an approval code (`P/getting-started/start-steps.ts:47,98,157`; `start-view.ts:36`). Approval is a modal in the web panel (`!FluxIQ/apps/web/src/app/GlobalClientGatewayPairing.tsx`). [C]
- Missing: "Start FluxIQ on this computer" (`start-steps.ts:157`) never says how. There is no link, command or download. A person with no Core running is stuck at step 1.
- Missing: nothing mentions signing in. Open FluxIQ lands on a login, with a forced password change on first sign-in (PANEL-001, a September record, not re-checked).
- Confusing: the "three steps" line promises chat next (`start-steps.ts:47`), but a model key is a fourth step, not listed.
- Confusing: the error state marks step 1 a problem and says "Check the connection address" (`:109`, address hint at `P/settings/form-fields.ts:60`), which shows a `ws://` address to a beginner.
- Good and worth keeping: a dead approval code is withdrawn after a worker stop (`start-steps.ts:49`, `P/state/background-loss.ts`).

**3. Model key.** Only after connecting, and only on the empty latest chat: "FluxIQ needs a model key before it can build. Add one in FluxIQ." plus Open FluxIQ (`U/view/empty-state-model.ts:42`). [C]
- Untrue route: the widget asks for an opener with `purpose: "model-key"` (`U/ports/host.ts:27`), but the extension's factory has no `purpose` field (`P/chat/chat-panel.ts:27`) and a grep of `P/` finds no use, so the button opens the generic address rather than the keys page.
- Late surprise: a locked key shows up only as a tail on a failed answer: "Your model key is locked for this browser: sign out of FluxIQ and sign in again" (`R/conversations/commands/progress.ts:59`).
- Unknown readiness says nothing (`U/onboarding/model-readiness.ts`), so a failed read lets the person type a request that cannot work.

**4. Empty state.** Title "What can FluxIQ do for you?", a four-sentence paragraph, "Describe what you want", "Extract data from this page", three examples (`U/view/empty-state-model.ts:35-53`). In the Lab, this slot shows only "Loading the conversation..." (A 01; `:105`). [S for loading, C for the rest]
- Untrue: the paragraph says "You can stop it, or take over the page, at any time". Take over exists for runs only, "never a build" (`U/controls/hold-control.ts`), so it is false during the first task, the moment it is read.
- Untrue [I]: the example "Check this page every morning" implies scheduling, and the offered capabilities have none (`B/panel/chat-capabilities.ts:8` lists six ids). I did not look for a scheduler in Core.
- Out of date: the paragraph sells "an automation you can run again", not an answer.
- Crowded: at 360 px the top bar holds a logo, the name, two tabs, record, dot, gear and ↗ (A 01). Icons are unlabelled, and "+" in the composer has no words. [S]
- "Describe what you want" only moves the caret. It is a button for something the box already offers.

**5. Asking for a task.** The person types. FluxIQ replies "I'll make you a new automation for this..." and "Starting..." (A 03; `R/conversations/commands/create-here.ts:49`). [S+C]
- Wrong promise: the first reply promises an automation, not the answer they asked for.
- Lab only: the "‹ Latest chat ... Project chat" line in every screenshot comes from the Lab's own `fluxiq:chat-project` event (`packages/test-runner/src/extension-chat-check/panel-driver.ts:113`, `P/shell/mount-panel.ts:212`). A real person on the latest chat should not see it (`U/view/context-line.ts:36`). [I, not confirmed by a real-person picture]
- Missing: the project's name is never passed (`P/chat/host-status.ts` has no `projectName`), so nothing says where the work is saved.
- Long automatic names: a new Flow is named from the first 80 characters of the message (`create-here.ts:128`), cut with "..." in chat and the list (D 20, F 06).

**6. Watching it work.** Step messages with reasoning, action cards, a live line, Stop above the composer, and a dark status card on the page itself (A 03-19). Run A's build took 3 min 14 s. [S]
- One step is told up to four times: bold title and reason, the card, the live line under it, and the on-page card (A 06).
- Internal words: "Changing the Flow", "Testing: Next page", "Judging the Flow", "Check of a test's result", "Records saved", "Not done: the Flow already does that" (A 06, 10, 11, 19, 27).
- Alarm without cause: a red "Didn't work: it didn't do the same when the test tried it again" sits directly above "Passed" and "Your Flow is ready" (A 19).
- Odd naming: a typing step is named by the box's placeholder text, not "the search box" (A 06).
- Missing: **no cost and no elapsed time in this view.** Run A spent $1.12 and B $1.89 with no number on screen. `Spent $...` exists only on a project-mode return card (`U/stream/step/project-words.ts:114`). No turn timestamps either, because the extension passes no `turnMeta`.
- Missing: no sense of progress or of how long is left. The scroll thumb shows a long transcript after 3 minutes (A 19). The steps are real and the user wants them, so this needs structure, not removal.
- Good and worth keeping: Stop stays stable and offered from "Starting..." (`U/controls/stop-control.ts`); the stream does not flicker.

**7. Permission and person-only asks.** Robot check: "FluxIQ needs you: complete the check on this page, then press Continue." with Continue and Stop (A 13; `R/parking/person-needed-ask.ts:34`). Permission: Allow / Don't allow (`U/conversation/ask-copy.ts:47`). [S for the check, C for permission]
- One ask, told four times: the sentence with buttons, the "Robot check: Waiting for you" card, the live line repeating the sentence, and the on-page card (A 13).
- Wrong direction: the headline says "answer in the FluxIQ panel" (`B/activity/host-words.ts`), though the first job is on the page. The host's `check` wording exists but this shot shows the `answer` one.
- Two buttons named Stop, a few pixels apart, with different meanings: the ask's (`route: "failed"`) and the work's (A 13).
- Redundant: "Show the question" appears while the question is on screen (A 13; `U/view/live-line-model.ts:43`). This may be specific to the Lab's project target; not checked for the real latest chat.
- Afterwards: "Done. You pressed Continue." is good (A 11).
- Permission dead end? [I] The extension passes no `asks` port and its relay sends no PIN (`B/panel/conversation-relay.ts:112`). The web panel has a PIN dialog (`apps/web/src/features/chat-widget/asks/`). What happens when a person presses Allow on a delete, money or send act in the extension was **not traced**. It must be checked before this UI is called done.
- Missing: an ask does not say what will happen on the site if allowed, and has no consequences list unless a host supplies one (`U/ports/ask.ts`).

**8. Result.** Build success: "Your automation "..." is ready: I explored..." (`create-here.ts:95-96`) and the on-page "Flow ready" (A 19-20). Run success: `"..." ran all the way through` when run from the chat (`R/conversations/commands/run-flow.ts:92`); "Run finished" otherwise (A 27). [S+C]
- **No result.** No rows, no preview, no answer, no list of what changed on the site. `dataset` appears nowhere in `U/` except a DOM attribute. Rows exist only behind the strip's exports (`P/automations/automation-strip.ts:90`).
- Reaching the rows: Automations tab, press the automation, find CSV or JSON on the strip. Nothing in the chat says so, and the strip shows only in an automation's chat (`P/shell/mount-panel.ts:220`).
- "How it was checked" is a one-line card with internal words: "The result was judged to answer the request" (A 27).
- No next action on the turn: no Run again, no Export, no Open. Turns carry only asks (`U/view/message-view.ts:92`).

**9. Failure.** Failure is a sentence in the stream, and sometimes the on-page card (B 34, D 20, F 06). [S]
- Machine prose: B 34 opens in lower case, repeats itself, says "Core's own record of this result shows... so no judge was asked", and is cut off with "..." (`R/automation-activity/wording/run-ending.ts:144`, `R/result-verification/computed-facts/computed-no.ts:47`).
- Raw code: "The step failed for good (executor.fault.unclassified)", then a bare "Run failed" (D 20).
- Blank page: D 20's tab is `about:blank` straight after "is ready". Nothing explains it.
- Jargon: "Build stopped. The Flow was not promoted." (F 06; `R/conversations/commands/build.ts:198`).
- Untrue tick: E 28 says "Not confirmed... the checks did not provide the required exclusion evidence", then "Run finished" with a green tick. The person cannot tell whether to trust the 8 rows.
- No next step: no Try again button, no "Here is what I have" although B saved 3 rows. "You can build it again" (F 06) is the only suggestion, with nothing saying what would differ.
- Good and worth keeping: progress.ts's rule that a failure says what stopped it and how far it got.

**10. A saved automation.** A row in "Your automations": name and one line (`P/automations/automations-tab.ts`, `row-element.ts:26`). Up to 30, no search, no folders (`rows.ts:8`). [C]
- Pressing it opens "Ask about X", usually empty, not how it was built (`U/view/empty-state-model.ts:55`): build events that spoke through another thread stay out (`U/stream/target-activity.ts:58`). [C, behaviour not seen]
- No state: a draft that was never promoted and a verified automation look alike, apart from "Not run yet". There is no plain "best attempt" concept.
- No rename, delete or duplicate in the extension.

**11. Running it again.** Strip Run, or "run it" in the chat. The panel follows the run to Chat (`P/shell/run-follow.ts`). Strip line: "Last run: Completed in 14.2s · No AI needed · This run did not keep a change for future runs" (`automation-strip.ts:148`; `summary-copy.ts:20,27`). [C; the run's chat is S, A 21-27]
- Wording: "This run did not keep a change for future runs" reads as a warning when it is the good outcome. "Whether this run kept a change is not available" is worse (`:21`).
- No comparison with the first time: no cost, nothing saying this was cheaper or faster, and no result in the chat.
- "Wait for FluxIQ to finish." blocks Run while anything is working (`:149`). Fine, but names no reason.
- Exports reach only the last run's data, and only for a focused row. "Too large to export here" sends the person to the web panel (`controller.ts:93`).

**12. Finding old work.** No list of chats. The extension's `conversation` port has no `listAllThreads` and it passes no `threads` (`P/chat/transport/ports/conversation.ts`, `chat-panel.ts:59`), so one project thread plus automation threads. No New chat. No search anywhere. [C]
- The steps do not last: activity is "ephemeral... a worker restart forgets it" (`B/activity/activity-relay.ts:21`), up to 10 units in memory (`fluxiq/src/ui/activity-status/history-limits.ts:15`). Coming back later shows only the turns, so "chat shows every step" holds only for the moment. [C; F 06's bare look is consistent]
- `history`, `turnMeta` and `pendingBanner` are all off in the extension (`chat-panel.ts:59`, `U/chat-widget.ts:189`).

**13. Recordings.** A record icon in the top bar; "Record supporting evidence" under New automation; a required dialog first (`P/recording/recording-controls.ts:56,66`; `description.ts:12`). When it ends, the panel jumps to Automations (`P/shell/mount-panel.ts:282`) and offers a primary "Author task instructions in FluxIQ" and a secondary "Attach to my next message" (`recording-review.ts:21,27`). [C]
- Off direction: it sends the person to the web panel to do what the chat does. The attach button should be primary.
- Extract is tangled in it: "Extract data from this page" switches tabs and starts a recording, with the same description dialog, though it's meant to be the no-AI start (`mount-panel.ts:197-204`, `recording-controls.ts:115`).
- Words: "supporting evidence" is the system's concept, not a person's.
- Dead code: `review-model.ts`, `review-view.ts`, `generated-preview.ts`, `test-outcome.ts` are exported and tested but only tests use them; their copy still says "Find it under Recent automations" (`review-view.ts:41`). [C]

**14. Settings.** Gear: two addresses, five switches ("Record what I type", "Allow direct requests"...), Save, Disconnect, on-page status, Report a problem, Forget this pairing, Open FluxIQ (`P/settings/settings-view.ts`, `form-fields.ts:60-66`). [C]
- Order: the first thing is a `ws://` address. Nothing about the model key, which project, or spending.
- Project: the only way off a stale project is Forget this pairing, which the Lab itself had to automate (`packages/test-runner/src/ui-e2e/journeys/extension-project.ts`).
- Good and worth keeping: errors stay until their cause ends, and a typed draft survives a popup closing.

**15. A stopped or crashed service worker.** Connection returns by itself (`docs/architecture/extension-client.md`, Staying Connected; `e2e/reconnect.spec.ts`). A request with no answer says "The extension restarted. Close this panel and open it again." (`P/copy/error-copy.ts:10`). No answer on open: "The extension isn't answering" with reload advice (`start-steps.ts:63`). [C]
- The socket is well handled. The experience of work is not: the relay's memory goes, so steps vanish from the chat and a build in progress may look idle until the next event. [I, not reproduced]
- "Close this panel and open it again" pushes recovery onto the person when the panel could ask again itself.
- Unmapped errors read "Something went wrong." with the detail only in a tooltip (`error-copy.ts:12`).

**16. Chrome side panel versus Firefox popup.** One UI, sized 380 x 580 in the popup (`P/shell/shell.css:23`). [C; no Firefox picture exists]
- **Firefox closes the popup when the page is clicked** (`P/extraction/panel.ts`, `P/settings/draft-store.ts`). Extraction and drafts handle this. Chat does not specifically: a robot check needs a click on the page, which closes the panel holding Continue. The person must reopen it, and they are told nothing about that. [I, the closing is C, the effect not run]
- Watching a long build needs the panel to stay open, which a popup does not do. The on-page card becomes the only live view, and it has no Stop (A 06) [S for the card in Chrome].
- PANEL-007 itself lists the Firefox popup as never exercised at 600 px. I found no panel spec for Firefox; `playwright.content.firefox.config.ts` covers content scripts.

**Only in the web panel today** (the brief's list): running and installing FluxIQ; sign-in and password; approving a browser; creating or choosing a project; adding, enabling and unlocking model keys; the PIN dialog for lasting acts; editing a Flow, its steps or instructions; run logs and traces; versions and rollback; permission settings; large exports; subflows (visible in the extension only as a word on project-mode cards); a recording's list and edit (the composer can only attach).

**Stale findings in `manual-panel-test-findings.md`.** PANEL-007's "cannot run, ask or stop" and "519-line controller" are gone: chat, Stop and Run all exist, and the toolbar indicator exists (`B/panel/toolbar-indicator.ts`). Its Current State still describes a September host on port 4711. PANEL-004 still holds for the extension: six capabilities (`chat-capabilities.ts:8`). PANEL-003 and -005 were not re-checked here.

---

## 2. Ranked problems, by harm to a first success

| # | Problem | Evidence |
|---|---|---|
| 1 | **The answer never reaches the chat.** A correct run ends with "Run finished". | A 27; `U/` has no dataset reader; `automation-strip.ts:90`; discovery 8 |
| 2 | **Setup depends on undocumented stops in another app.** Run Core, sign in, approve, add key, maybe unlock key. | `start-steps.ts:47,157`; `empty-state-model.ts:42`; `chat-panel.ts:27`; `progress.ts:59` |
| 3 | **Endings contradict themselves.** "Ready" then a failed first run; a tick on an unconfirmed result; red then Passed. | D 20; E 28; A 19 |
| 4 | **Failures are machine prose with no next step**, and failure is the common case. | B 34; D 20; F 06; `run-ending.ts:144`; `computed-no.ts:47`; discovery Outcome 5 |
| 5 | **The first reply and the whole stream are about building a Flow, not doing the task.** | A 03, 10, 19; `create-here.ts:49`; `empty-state-model.ts:35` |
| 6 | **Cost and time are invisible**, at $1-2 per attempt. The second-attempt story can't be told. | A 06-27, B; `project-words.ts:114`; `summary-copy.ts` |
| 7 | **Nothing to do after the end.** No Run again, Export or Open on the turn, and the tab it needs is unnamed by the chat. | A 27; `message-view.ts:92`; `mount-panel.ts:220` |
| 8 | **Asks are repeated and misdirected.** One check four times, two Stops, "answer in the panel" for a job on the page; lasting-act PIN path untraced; Firefox popup may close on the very click. | A 13; `host-words.ts`; `conversation-relay.ts:112`; `P/extraction/panel.ts` |
| 9 | **The onboarding promises what isn't there.** Take over during a build, a morning check; recording and extraction as a tangled second route. | `empty-state-model.ts:35-53`; `hold-control.ts`; `mount-panel.ts:197`, `recording-review.ts:21` |
| 10 | **Old work can't be found or understood.** Steps are ephemeral, no list of chats, no search, 30 rows, names cut from the request, draft and proven look alike. | `activity-relay.ts:21`; `chat-panel.ts:59`; `rows.ts:8`; `create-here.ts:128` |

---

## 3. What the new product needs from the UI

**Exploration in progress**
- First reply promises the result: "I'll do this on [site] and show you the result here. I'll save how I did it, so next time is quicker."
- A sticky **work header** above the composer, replacing today's Stop row and live line: `Working · 1m 12s · $0.34 of $5.00 · [Stop]`, with what it's doing now in one line. Stop stays stable.
- **Each step once**: one reason sentence and one result line per step. The on-page card shows only the current step and Stop. Chat keeps every step with its reasoning (standing direction).
- **Plain step words**: "Tried again", "Went to page 2", not "Testing: Next page". A retry that is routine is quiet, not red; red means the person should care.
- Spending: show the purse when one applies. A warning when near the limit, before it stops.
- No Flow vocabulary while exploring: no "Changing the Flow", "Judging".

**The result: an answer turn**
```
 Found 10 of 10                                   ✓ Checked
 [column | column | column | column]
 [first 5 rows...]                     Show all 10 · CSV · JSON
 On the site: nothing changed
 Checked: right columns, cheapest first, no duplicates
 From: 3 results pages, [site]  ·  3m 14s · $1.12
 Saved so next time is quicker      [Run again]  [What I did]
```
- Kinds: **rows** (preview, count, export), **done on the site** (each lasting act in words, with its undo if any), **plain answer** (a sentence and a source), **partial** ("Here are the 3 I got, and what's missing").
- The check is said honestly in three states: checked, **not sure** (no tick, says why in plain words and asks the person to look), failed.
- Provenance: which pages and when, as host and page words, never a selector.
- "Done on the site" must be truthful: it comes from Core's record of lasting acts, not the model's prose.

**The saved best attempt, in plain words.** A chip on the answer and row, one of:
- `Ready: worked last time` / `Saved: partly works, I'll repair it next time` / `Notes only: couldn't save steps, I'll start from what I learned` / `Needs you: stopped at a check`.
- Only claim what's true: discovery found that a saved draft isn't reused in project mode today and no draft exists if none was assembled (`discovery.md` Outcome 3, section 1). The chip must read those states from Core rather than guess.

**The second attempt, visibly cheaper and faster.**
- Before it starts: "Using what I saved from [date]".
- While running: steps marked as "From saved steps" versus "Worked out again" (only the latter cost money).
- On the answer: `This time 18s and $0.00. First time 3m 14s and $1.12.` and, when it repaired: `I fixed 1 step and saved the fix`.
- Never an exact improvement claim Core can't attribute (the rule in `summary-copy.ts`).

**A task's history.** Each task has a timeline of attempts: date, how it ended, time, cost, rows, repaired or not. Pressing one opens that attempt's answer and steps, which requires steps to be durable in Core, not relay memory.

**A project with nested subflows.** See section 4 for the screen.
- Browse: tree of site subflows, action sub-subflows below, indented with a count and state.
- Search: by name, site, and what it does, across the project.
- Run: a subflow with inputs asks for them in chat, and its answer lands in the chat.
- Inspect: plain words first ("Signs in, then opens the cart"), who calls it, last used and result, then steps. Edit by asking in chat.
- A task's "What I did" links to the subflows used.

**Asks and approvals.**
- One ask, one place: a card in the stream, mirrored only as a short pointer in the work header. Remove the duplicate card and live-line sentence.
- Person-only: "Finish the check on the page, then press Continue". Continue is primary; the secondary is named by effect, "Stop the task". On Firefox the page card carries Continue, or a re-open prompt with the badge.
- Permission: says the act, the site and what will change, with Allow once / Don't. Lasting acts take the PIN **in the extension** (host dialog through `ChatAskPort`), or plainly route to where it's possible.
- What it waited for and how long, kept in the transcript.

**Failures that are honest and say what next.** Each has the same shape:
```
 I couldn't finish this.
 Why: the Next button on page 2 didn't move the list.
 Got: 3 of the rows.              [Show them]
 Saved: steps up to page 2.
 Next: [Try again] [Tell me more] · cost so far $0.40
```
- Words come from Core's typed ending (`discovery.md` section 1 lists them), mapped to a closed set of reasons and next actions. Never a code, "Core", "judge", or a cut sentence. The detail stays behind "Tell me more" for whoever debugs.
- Lower-case openings and "..." cuts go. A long reason wraps.
- Budget stop, time limit, provider failure, key problem and person-stop each have their own next action.

---

## 4. Information architecture and screens

**Principles.** One column. The chat is home. Everything else is a slide-over that returns to the chat. A task is the unit a person thinks in; a Flow is how it's saved.

**Words.** Use **task** (what you asked), **saved steps** or **automation** (decide one; today it's both Automation and Flow), **attempt** (one try), **library** (subflows). Retire to person-facing: Flow, build, promoted, candidate, trial, judge, supervisor, adaptation, "Core".

```
 ┌ Top bar ───────────────────────────────┐
 │ ☰ Tasks   Find deals on this site ▾  + │   task name; + New task; ⚙ inside ☰
 ├────────────────────────────────────────┤
 │ you: ...                               │
 │ step · reason · outcome                │
 │ step · reason · outcome                │
 │ ┌ Answer ────────────────────────────┐ │
 │ │ rows · checked · cost · Run again  │ │
 │ └────────────────────────────────────┘ │
 ├────────────────────────────────────────┤
 │ Working · 1m12s · $0.34        [Stop]  │   only while working
 │ Message FluxIQ                 + ↑     │
 └────────────────────────────────────────┘

 ☰ Tasks (slide-over)            Library tab inside it
 ┌────────────────────────────┐  ┌────────────────────────────┐
 │ Project ▾     [Search...]  │  │ Project ▾     [Search...]  │
 │ [Tasks] [Library]          │  │ [Tasks] [Library]          │
 │ Today                      │  │ ▾ shop.example  (6)        │
 │  Find deals      ✓ 18s $0  │  │   ▸ Sign in      Ready     │
 │  Fill form       ! Needs you│ │   ▾ Search       Ready     │
 │ Yesterday                  │  │       Apply filter  Ready  │
 │  Read team page  ~ partly  │  │       Next page  Repaired  │
 └────────────────────────────┘  │ ▸ jobs.example  (2)        │
                                 └────────────────────────────┘
 Task details: attempts timeline, last answer, Run, Export, Rename, Delete.
 Subflow details: what it does, inputs, used by, last result, steps, Run, Ask about it.
```

**Setup.** One screen, in order, with state detected: FluxIQ running → signed in → browser approved → model key. Then the chat opens with a working example, ideally one on the page they're on. Each step has its exact action: "Start it with..." or the hosted equivalent, Open at the right page. The code and address stay as now.

**Settings.** Account and connection state in words, project, model key status with a deep link, spending limit, on-page status, Report a problem. Addresses, capture switches and Forget go under Advanced.

**Recording.** A composer attachment: "+ Show me how" records and attaches to this message. Extract becomes "+ Pick a list on this page", or a task reply. No top-bar button; no dialog before starting (ask for words in the chat afterwards).

**Not needed.** Tabs Chat/Automations (replaced); top-bar record and ↗ icons; "Latest chat" and "Project chat"; thread picker as a `<select>`; "Describe what you want"; a Flow graph or editor in the extension; run logs, traces and version diffs (web panel, later); model picker; per-step debug in chat; the unused recording review code; a dashboard; a second onboarding paragraph.

**Where each piece belongs**

| Piece | `@fluxiq/ui-components` | Extension adapter (`P/chat`, `P/`) | Core |
|---|---|---|---|
| Answer turn, rows preview, partial, not-sure, failure card | Rendering, models, styles, new `results` port | Port over the background; download through `downloadFile`; `chrome.*` | Stored answer record, typed ending, check result, provenance, lasting-acts list |
| Work header (time, cost, Stop) | Rendering, pacing | Passes activity | `spentUsd`, purse and elapsed on activity display |
| Step words, one telling | Stream grouping and fold | None | Activity wording (`R/automation-activity`, `fluxiq/ui`) and the person-text guard |
| Durable steps | Reads them | Relay stops being the source | Persist activity per attempt, served through a read |
| Saved-state chip | Chip and words | None | The state, as a closed set |
| Attempts and comparison | Timeline, comparison line | None | Attempt series per task, with cost and time |
| Tasks list and search | List, search, slide-over | Remembers last screen | `tasks.list/search`, naming |
| Library tree and details | Tree, details | None | Nested subflow model, search, run with inputs |
| Asks | Single card, PIN dialog via port | Draws the dialog host, sends PIN, popup re-open, badge | Consequences words, ask kinds |
| Setup | Empty/setup model if shared | Steps, connect, approve state, deep links | Readiness read (signed in, key, project), deep-link routes |
| Settings, recording capture, overlay, extraction sheet | None | All of it | Policy, recording service |
| Words and icons | Shared vocabulary in strings and `icons/` | Connection copy | Wording of events |

---

## 5. Phased build list, smallest valuable first

Common check rule: unit tests beside the code with `@fluxiq/ui-components/testing`'s fake DOM; provider-free Playwright specs **on the ten realistic scenarios only**, headed, in the style of `apps/extension/e2e/content/tests/activity-overlay/tests/chat-truthful-visual.spec.ts` (real renderer, scripted events, realistic page). Never a synthetic page in a browser. Live UI review stays in each live loop, with no new paid run needed for these phases.

| Phase | Build | Proves | Checked by | Before Core? |
|---|---|---|---|---|
| **0 Truth pass** | Failure sentence shape, no codes, no "...", no lower-case openings; no tick on "not confirmed"; red only when it matters; fix onboarding claims; "Show the question" only when it's elsewhere; delete dead review code | The chat stops saying untrue things | Unit tests on `run-ending`, `card-words`, `empty-state-model`; extend Core's person-text guard to ban the leaked words; visual spec on everything-store and crossborder-marketplace with scripted endings | Yes for UI; wording is a small Core edit (repo boundary alert) |
| **1 Answer turn with fakes** | `results` port and `ChatAttachment` kind `answer`, rows preview, counts, CSV/JSON, on-site list, check line; Run again | A person sees and can take the result without leaving chat | Spec on company-website with a scripted answer; export spec via `downloadFile`; keyboard and 360 px layout | **Yes**, fake port and scripted attachment |
| **2 Real rows from existing data** | Adapter reads the last run's dataset (`runDetail`, `exportDataset`) into the answer turn after a run | Value before Core's answer work, for saved runs | Provider-free run on crossborder-marketplace, oracle rows match the preview | Yes, existing endpoints, needs preview size handling; a sample read may need a small Core addition (not verified) |
| **3 Work header** | Time, cost, stable Stop, on-page card with Stop; single telling of a step and an ask | The person knows what it costs and can stop | Pacing unit tests; spec on job-board with scripted events; robot-check spec on crossborder-marketplace | Time yes; cost with fake field until Core adds it |
| **4 Setup** | One setup screen, deep links, readiness; passes `purpose` | A new person reaches a first task | Unit tests per state; headed spec with a stand-in gateway and a realistic page; web deep links checked once with the panel only if the user authorizes | Mostly; deep-link routes and readiness read need Core |
| **5 Saved state and second attempt** | Chip, "Using what I saved", from-saved marking, comparison line | The loop's value is visible | Scripted two-attempt spec on bigbox-retail; provider-free replay on everything-store to confirm the numbers read true | Yes with fakes; real needs Core's attempt series and draft reuse |
| **6 Tasks list** | Slide-over, search, task details, attempts; New task; retire tabs | Old work can be found | Spec on local-classifieds with fake store; owner-change tests; keep names the Lab presses or update the Lab with it | Yes with fakes; real needs `tasks` |
| **7 Durable steps** | Read steps from Core; survive worker restart and reopen | "Every step" stays true later | `reconnect.spec.ts` extended on a realistic scenario: restart the worker mid-work and after, steps still show | No: needs Core persistence |
| **8 Asks complete** | PIN dialog via `ChatAskPort`; consequences; Firefox popup re-open | Lasting acts finish in the extension, on both browsers | Spec on auction-marketplace (Chrome), content config plus a new panel config (Firefox) on the same scenario | Needs tracing first (section 1, step 7) |
| **9 Library** | Tree, search, run with inputs, inspect | Nested subflows are usable | Spec on professional-network with a fake tree, then real | Yes with fakes; real needs Core's model |
| **10 Recording as attachment; settings order** | "Show me how", Pick a list in the composer; Advanced | Chat-first end to end; fewer routes | Existing extraction specs on everything-store and company-website stay green; recording spec on photo-social | Yes |
| **11 Firefox pass** | Popup layout, long work without an open panel, badge | Parity is real, not assumed | Firefox panel spec on social-network-feed, manual note of what wasn't exercised | Yes |

**Lab impact.** The Lab presses names: `#connectButton`, "Settings", "Start recording", `#stopRecordingButton`, `panelTab-*`, the settings labels (`extension-client.md`, Panel UI; `start-steps.ts:15`). Phases 4, 6 and 10 must move those names or change the Lab in the same unit.

---

## 6. Verified versus inferred

**Verified by screenshot** (Chrome side panel, E2E build, Lab-driven): the top bar at 360 px, "Loading the conversation...", the first reply, Stop, step messages and cards, the on-page card, the robot check waiting and settled, "Your Flow is ready", "Run finished" with no rows, "Run failed" text in B and D, "Not confirmed" with a tick in E, "Build stopped... not promoted" in F.

**Verified by reading code**: everything marked [C], including no dataset reader in `U/`; no `purpose`, `threads`, `asks`, `turnMeta`, `pendingBanner` or `listAllThreads` in the extension's chat; `projectName` never passed; relay activity ephemeral; dead review modules (tests are the only importers I found, grep over `apps/extension/src`); `Take over` for runs only; six offered capabilities.

**Inferred, not run**: a real person's latest chat omits the context line; opening an automation shows an empty chat after a build in another thread; steps vanish after a worker stop; a build in progress looks idle after one; Firefox closing the popup on the page click in the middle of a robot check; "Show the question" outside the Lab's project target; whether a sample of rows can be read with no Core change.

**Not verified at all**: how Core treats Allow on a lasting act with no PIN (not traced); getting-started, Automations, strip, Settings, recording and extraction as drawn, since no picture exists (a provider-free capture would fix this cheaply, and should be Phase 0's first step); Firefox at all; a real first run on a clean machine; dark mode; whether a scheduler exists in Core; PANEL-003 and -005; the sign-in steps on a fresh install today. I did not read `docs/working/answer-first-plan.md` in either repository (outside the brief); the phases and port names here should be reconciled with it.

---

## Commands run and observed results

Read-only `cat`, `sed`, `grep`, `find`, `ls`, `git show --stat`, `git log --oneline`. 19 screenshots viewed. One broad `find` over `FluxStuff` hit its time limit and was stopped. No code, Lab, browser, provider, panel or test ran. Nothing changed but this report.

## Open questions for the supervisor

1. **Should finished work's steps fold?** The widget's header says "No folds, no counts" (`U/chat-widget.ts:14`). That is a code comment; the user's stated rule I can find is that each step shows with its reasoning. I recommend: nothing folds live, and after the answer arrives the steps stay in place above it, open. Folding later is a user decision.
2. **One noun:** "automation" (in the tab and chat today) or "saved steps"? Recommendation: keep "automation" as the saved thing and add "task" as what the person asked. Retire "Flow" from person-facing words, including the on-page card. This touches Core's wording and its guard.
3. **Cost display:** the memory says $0.25 per Flow in product tests and the AGENTS.md says $5 per Claude build in live tests; discovery shows real builds at $1-2. The header's "of $X" needs one source. Budget design is outside this study.
4. **Contradiction:** `R/conversations/instructions/prompt.ts:92` tells the chat model "A compatible saved draft continues", which discovery found false in project mode. The second-attempt UI must not rely on it until Core makes it true.
