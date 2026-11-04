# Answer First

Status: Active
Status detail: Steps approved by the user on 2026-11-03, with the hard rule that a task ends only with its result or its budget gone. Lanes starting; no paid run yet.
Created: 2026-11-03
Last updated: 2026-11-03
Owner: Senior supervisor agent
Scope: One live exploration that reaches the person's result, a best-attempt Flow improved in simulation with the exact recorded inputs, the same loop on every later attempt, a searchable and runnable nested subflow library, and the extension and @fluxiq/ui-components experience for all of it. The web panel is out of scope until the user reopens it.
Paired document: `docs/working/answer-first-plan.md` in FluxIQWebExtension (the Lab's scores and the extension's phases)
Related: [discovery](./answer-first-plan/reports/discovery.md), [simulation study](./answer-first-plan/reports/study-simulation.md), [subflow study](./answer-first-plan/reports/study-subflows.md), [extension study](./answer-first-plan/reports/study-extension-ux.md), [offline trials plan](./trace-offline-trials-plan.md)

---

## Current State

**The idea, in the user's words (2026-11-03):**

- "we do our best to one-shot the flow, then return the final result & save our best attempt determinstic flow, notes, etc. Then next time we try that task, we try using flow & do same build/repair/use flow, return final result, etc. Over time it should improve significantly."
- "since we're switching to a one-time exploration (MUST RESULT IN DESIRED FINAL RESULT), we use internal state engine simulation to improve & test flow with EXACTLY same inputs as real exploration calls recorded."
- "its not simply that hte LLM fully just takes over and we forget the flow"
- "We're going to fully focus on the extension/fluxiq ui components package & extension UI/UX for now." The web panel will change later, "but we'll discuss that later".
- "we need a system for actually detecting when we're repeating a known subflow. And subflows will need to be easily searchable, runnable, etc within a project flow... they may have a subflow that includes one site, that then calls a sub sub flow for a specific action on that site."
- "I'm trying to make 'one-shot'/two shot systems that adapt and get more efficient over time."
- **The one hard requirement:** "it needs to actually GET the final result, not just return a failed response (except for run out of budget on that task)... The only hard requriement is it NEEDS to keep retrying until final result achieved or budget out"
- "NO PIN FOR ANY NORMAL ACTIONS. Maybe just a pin to do dangerous actions ONLY THE FIRST TIME A USER DOES IT, AND NEVER IN THE MIDDLE OF A FLOW, ONLY WHEN FIRST STARTING A FLOW/CHAT."
- "i want built in agent call loop detection. If an agent keeps doing the same thing over and over that needs to be detected and steered/stopped"
- On the tester: "It likely needs imprvovement/full development, i have no idea if its even really been built."

**State.** The user approved the steps on 2026-11-03 ("ok steps are good"). The user's words above are theirs. Other detail here is the lead's design unless marked "user". t856 (taking the PIN back out of the middle of a Flow), the truth pass and the engine go/no-go are starting. No paid run has happened or is planned before the Exploration lane reaches it.

**What the studies established:**

1. **The product's output is a Flow, not an answer.** A correct run ends with "Run finished", and the rows are about four presses away as a CSV.
2. **No path can end with a result today.** A build can only name a plan, a recovery can only return a patch, and rows read while exploring are never stored. A passing trial does the work and then drops it.
3. **Saved drafts are not reused in the default mode,** though the chat model is told they are.
4. **Lasting acts live in four unconnected records.** Closing that is the highest-consequence work here.
5. **The live runs of 2026-10-31 and 2026-11-03 ran `legacy`, not the product's default `project`.**
6. **Today 0 of 43 of a Flow's acts equal exploration's calls byte for byte.** Most of the difference is mechanical: safe normalisation reaches 37 of 63 non-snapshot commands. The other 26 are real differences: another row, read, target or URL.
7. **All 26 inconclusive offline checks were real changes, not capture failures.** 11 were a changed filter, which runs in the extension today, and all 34 rows of the six final reads were already in exploration's rows, so those can be computed with no page.
8. **A state rule answers 141 of 173 commands where the strict cursor answers 6, but a first crude prototype agreed with live too rarely** (URL 51 of 74, act status 8 of 17, against a Flow's own 73 of 77 and 110 of 125). That is why the Engine lane starts with a go/no-go.
9. **Nesting already runs, but nothing can be shared, searched or run alone.** Every subflow belongs to one Flow, and a saved one records no purpose, site or start.
10. **The extension tells the story of building a Flow, not of doing the task.** Failure is the common case (2 of 14 Lab runs since 2026-10-30) and reads worst.

**Blockers.** None. The user answered questions 4 and 6 and the tester question. The lead is going ahead on its own recommendations for questions 1, 2, 3 and 5, and the user can overrule any of them.

## The Loop

Every attempt, first or fiftieth, is the same five stages.

| Stage | Attempt 1 | Attempt 2 and later |
| --- | --- | --- |
| 1. Find | Nothing saved. The free opening look shortlists known subflows | Saved Flow found by task key |
| 2. Do it live | One exploration, recorded, that must reach the result. It writes the draft as it goes | Run the Flow, judged. A failing step is repaired live from the page it left, and exploration continues to the result if repair cannot |
| 3. Answer | The result, shown in chat, labelled honestly | The same, plus "this time vs last time" |
| 4. Improve | Test and repair the draft in simulation against that recording. No site, no second live run | The same, against this attempt's recording |
| 5. Save | Best-attempt Flow, notes, recording, acts, attempt record, subflow cards | The same; trust rises or falls |

A task becomes **one-shot** when attempt 1 gets the right answer, **two-shot** when attempt 2 does at the latest, and **deterministic** when an attempt gets the right answer with no model calls. **Getting more efficient** means model calls, tokens, dollars, live steps and time per attempt fall on the same task. The user confirmed these definitions on 2026-11-03.

**The Flow is never forgotten and never a gate.** Every attempt tries to leave a better Flow, and no attempt withholds the result because the Flow is not ready.

**The one hard requirement (user, 2026-11-03).** A task keeps going until it has its final result or its budget is gone. There is no third ending that reports failure. See "Keep Going Until The Result".

## Decisions

**D1. One live exploration, which must reach the result (user).** It ends with the person's result, not at a submission or a test. There is no trial, reset or dry run inside it, so acts land once. A permission ask pauses it and it continues in place, where today that ends the build. The 12 places in today's loop that work against this are tabled in the [simulation study](./answer-first-plan/reports/study-simulation.md), section 8.

**D2. Exploration may run what it has written, forward from where it is (lead).** "Must reach the result" and the user's rule that the model should generalise rather than run every iteration seem to conflict. They do not, if the model does the first row by hand, sees that it worked, writes the loop, and runs that loop on the remaining rows only, from the page it is on. It reaches the whole result cheaply. A wrong loop shows up after one row, not fifty. Those later calls are recorded in the Flow's own wire form, which is part of what the simulator needs. It is built from `core.run_flow`'s partial run and never restarts from the top. Rows already done are excluded by the act record (D6).

**D3. The result comes first; improving comes after (lead).** The answer reaches the chat as soon as it is judged. Simulation and repair run after it without blocking the person, under the same attempt's budget. A chat line says the steps are being improved. Paid work stays tied to a live attempt, so nothing runs unattended.

**D4. Two questions stay separate (lead).** "Is this answer right" labels a result. "Does this Flow do the task" decides whether a Flow is finished. The user's rule "a finished Flow needs one judged whole run as it finally stands" keeps its meaning and moves in time: attempt 1 ends with a simulated draft that is not finished, and the next real attempt's live judged run is what can finish it.

**D5. Later attempts are the same loop (user; lead for the detail).** The Flow runs live and judged. A failing step is repaired live from the page it left, as the standing rule says. If repair cannot fix it, exploration carries on from there to the result. Either way the person gets the result, the new calls are recorded, and the fix is checked in simulation before it is saved. Re-running from the start stays declined when a stated lasting act may have landed (t848, t854).

**D6. One act record per attempt (lead; the rule is the user's).** Merge the four records into one, persisted and carried across all stages: what, where, classes, state, row. The exploration receives it, an identical repeat is refused, and it looks at the page before acting on anything that may have landed. A repeat that looks different to the code is possible, because identity across build, trial and run is unsolved. The Lab's double-act oracle exists to catch that. An undeclared lasting press stays a disclosed limit until this record covers it.

**D7. One path: a single loop (lead; user question 1).** One exploration means one loop. The Claude numbers that exist are from the single loop: 10 to 16 decisions and $1.12 to $1.89 a build. The project supervisor, its builders and their per-part tests exist to cut work into separately tested parts, which this design replaces, so it stops being the default. Its code stays, and it may return for large multi-site builds once the library exists. This also means no paid comparison of `project` against `legacy` is needed before starting: money is better spent on the new loop.

**D8. One budget per task attempt (lead; user question 2).** One purse wraps the attempt, and running out is the only failure ending there is (user). So the default should be generous enough that it rarely decides the outcome: $5 per attempt in the Lab and the product, set in settings, with a visible meter. A reserve is kept for the judge, using the mechanism that already exists. Near the limit the person sees it coming. At the limit they get the best result so far, what was saved, and a one-press way to add budget and carry on from where it stopped, and the draft is still saved.

**D9. Honest labels (lead).** Reuse `confirmed`, `refuted` and `unverified`, and say where a result came from. One judge call says it was checked once, because one yes once finished a build on wrong rows (t296). Rows come only from real reads; a model never writes a row. A plain-language answer is labelled as the model's words. The judge needs a Flow-less summary (rows, acts, end view), which is the largest single change in verification.

**D10. Which task is this (lead).** Running a saved Flow on a guess spends real acts. Only an exact instruction digest, or the person choosing it, may run a saved Flow. A paraphrase starts a new attempt that may use a related draft or subflow as a known starting point, which is safe because it is re-checked as it runs.

**D11. What gets saved (lead).** The best-judged draft beside the latest, which today overwrites it. Notes: what worked, what failed and site quirks, written by the model at the end of each attempt, screened, per project, and shown to the next attempt's exploration; they are the person's data and never reach shared guidance. The recording, the act record, and an attempt row with task, attempt number, path, calls, tokens, dollars, time, live steps, simulation result and label.

**D12. Recording in the product (lead).** Tracing is off in the product today, and page captures pass through secret screening unscreened. Before product use: record explorations only, screen captures, keep the latest recording per Flow with a retention rule, and say so in settings. Recordings stay on the person's FluxIQ. Hosted needs sealing. Firefox has no page capture, so it can use recorded results only.

**D13. Dangerous actions and the PIN (user; lead for how).** "NO PIN FOR ANY NORMAL ACTIONS. Maybe just a pin to do dangerous actions ONLY THE FIRST TIME A USER DOES IT, AND NEVER IN THE MIDDLE OF A FLOW, ONLY WHEN FIRST STARTING A FLOW/CHAT." Normal actions never ask for a PIN. Dangerous means the three gated classes that exist today: moving money, deleting and sending. The first time a person starts a chat or Flow that can do one, the PIN is asked once at the start, and it leaves a standing grant, so they are not asked again. Nothing ever asks for a PIN once a Flow is running. If a dangerous act comes up mid-Flow with no grant yet, it stays a one-press Allow, as the extension has it today (lead's reading; the user said "maybe" about the PIN at all, so this is easy to drop). t855's mid-run PIN check, which the lead caused, comes out in t856.

## Loop Detection

**D14. Every agent's calls are watched for loops (user, 2026-11-03; lead for how).** "i want built in agent call loop detection. If an agent keeps doing the same thing over and over that needs to be detected and steered/stopped" It is built into Core's evidence loop, so every agent role gets it, costs no model call, and sits beside the existing guard in `runtime/llm/repeat-guard/`.

**What exists.** One guard refuses a call whose tool, input and page match an earlier call that failed or changed nothing. It was built after a cookie button was pressed 20 times. A recovery's own loop also has a progress guard. Neither sees the rest of the table.

| Pattern | What it looks like | Today |
| --- | --- | --- |
| Exact repeat | The same call on the same page, which failed or changed nothing | Caught |
| Near repeat | The same call with only free text changed, such as its reason or summary | Missed: rewording gets past the guard |
| Cycle | A B A B, such as open and close, or next and back, across pages | Missed |
| No progress | Calls that each "succeed" while no new page state, row, landed act or draft change appears | Missed outside recovery |
| The same fix again | A draft edit undone and redone, or a repair already tried, after a fresh start or on a later attempt | Missed: fresh contexts forget |

**What is not a loop.** Working through rows or pages. A repeated call that brings new rows, a new row identity or a new page state is progress. That is the false positive that matters most, so progress is measured from those facts rather than by counting calls.

**What it does, in order, each step only if the last did not work:**

1. **Steer.** Tell the model plainly what it has repeated, how many times and what has not changed, in generic words. It also shows in chat as a step.
2. **Refuse** the repeating call before it runs.
3. **Change approach.** A fresh, small context from the page as it stands, with the notes, the act record and a list of what was already tried, so the same fix cannot simply come back.
4. **Stop spending and ask the person (lead's reading of "stopped").** If fresh approaches loop too, it stops, keeps the best result so far and the draft, and asks: "I keep getting stuck on this. Here is what I have." Keep going, tell it more, or stop. This is not a failed ending, because the task waits and resumes with its remaining budget, and it stops a loop eating the whole budget. It is the one place a task pauses short of its budget, so the user may overrule it. Under the Lab's hard rule a task that ends this way without its result still fails.

**Proof, with no paid run.** Replay the detector over the saved step logs. It must catch the recorded loops, including `run-muq310ht-ab80eed0`'s 20 presses and eight re-reads, and fire on nothing in runs that worked through rows and passed. A scripted-model test per pattern and per step of the ladder. The attempt row and the Lab's report count loops caught, so it can be seen falling over time.

## Keep Going Until The Result

The user's hard requirement, as a design. Exploration ends when its result is judged achieved, or when the budget is gone, or when the person presses Stop. A person's Stop always wins. Everything else that ends a build or run today stops being an ending.

| What ends a task today | What it becomes |
| --- | --- |
| `not_doable`, `not_finished`, no candidate assembled, a verdict of no or unsure, draft kept | Not endings. A judge's no goes back to exploration with its reason, and it keeps going |
| Run failed at a step, refuted, repairs exhausted (3 attempts), failed-step re-author once per run | Exploration carries on from the page as it stands |
| 30-minute limit, rounds limit, no-progress guard, replies unreadable, trial limits | Not endings. A stall goes to loop detection (D14), which steers it and changes approach |
| An uncertain lasting act (`run.outcome_uncertain`) | Look at the page to settle it, then continue. It never repeats the act blind |
| A permission the person declined | It looks for another way without that act, within the budget |
| A person-only check | It waits for the person, as now |
| Provider silent or unavailable | Retry with backoff, costing nothing, and say so in chat. The person can press Stop |
| Refused before any model call (about 35 codes, such as `pending_adaptation_exists`) | Each one is either resolved automatically or becomes a setup step that says what to do. None is reported as a failed task |
| **Budget gone, including an empty balance** | **The only failure ending:** the best result so far, what was saved, and add budget and carry on |

**What "achieved" means.** A judged yes, or Core's own checks where those suffice. An unsure judge keeps it looking for evidence. The best result so far is kept throughout, so even a budget-out shows what was found, labelled as not confirmed.

**Retrying never means repeating a lasting act.** The act record (D6) carries across every retry and change of approach. The rule against repeating acts stands alongside this one.

**A consequence to be plain about.** A task that truly cannot be done spends its whole budget before ending, because nothing is allowed to decide it is impossible. That is what the $5 default bounds.

**Proof.** A provider-free test for each row of the table, driven through the real loop with a scripted model. The Lab fails any task that ends without its result unless its budget is gone or a person stopped it.

## The Simulation

The user's "internal state engine" is the offline trial machinery with its cursor replaced, as the user confirmed on 2026-11-03. It exists but is weak today, and this is full development rather than a tweak: it only answers computation-only changes, and across 12 saved runs it avoided 2 of 61 live test windows. It reuses the socket, intake, virtual clock, id translation, trace admission and the rule that a simulated pass is never proof. Full detail is in the [simulation study](./answer-first-plan/reports/study-simulation.md).

```text
RECORDING  one exploration's calls, its result, kept acts, end state, witnesses.
STATE      page position + acts done. A successful act or page move starts a new state.
READ       same state and exact input -> the recorded answer. The nth repeat gets the nth.
           Else the row computer for filters on columns already read. Else a gap.
PAGE MOVE  a recorded move from the same acts done. Else a gap.
ACT        a recorded act, unused, same row. Once. Siblings may go in any order.
           Used again -> gap: would repeat. Never recorded -> off the recording.
END        every recorded act used, or carrying a receipt for why it was dropped.
VERDICT    no model: same rows + acts covered + reached the end -> passed against the recording.
           A check failed on recorded support -> fail, with repair feedback.
           Any gap -> inconclusive, with its step and reason.
REPAIR     bounded to 3 rounds. The model re-expresses the step with a recorded input,
           or flags it to be tried live next time. A flag blocks nothing and is shown.
```

**"Exactly the same inputs" has to be built.** Flow steps wrap the same element in extra target and wait fields, so the first step is one canonical form for exploration and Flow, with every normalisation declared. Row identity, `where`, `text`, `url`, `value`, `checked` and `ensureState` are never normalised away, because those are the real differences. D2 helps further, by recording loops in the Flow's own form.

**The go/no-go.** Before anything is built on it, saved Flows go through the rule offline and are compared with their own live answers. The target is near a Flow's agreement with itself: 73 of 77 for page URL, 110 of 125 for act status. Then a replay of all saved builds must show **0 false passes on saved failed runs**. If the rule cannot get close, the Engine lane stops and the user decides. The product still works without it, because attempt 2's live run is the real test; drafts would just arrive less polished.

**What it can and cannot do.** It catches a wrong filter, a dropped act, a repeated act, the wrong row, a wrong order and wrong computed rows, all free after the first model call. It cannot prove a new target, a page never reached or a branch not taken: those come back as flags, tried live next time. It knows one history, so a pass says the logic fits the recording and nothing more, and it is shown as "checked against my recording, not yet run live". The simulated-pass, live-fail rate is the metric that says whether it earns its place. A repair round on Claude costs about $0.26-0.34; a re-simulation costs nothing.

## The Subflow Library

Full detail, including the walk through the user's dashboard example, is in the [subflow study](./answer-first-plan/reports/study-subflows.md).

**What a subflow is, under one exploration (lead; user question 3).** Nothing cuts parts once the supervisor is gone. The model marks them as it writes the draft, using the `part` grammar it already has, with generic guidance on what makes a good part, and a person can say "save this". The library has nothing to hold until this works, so it comes first.

**The card.** A versioned, project-scoped subflow with: name, purpose in the person's words, sites, inputs, outputs, fixed values, lasting classes, start check, end check, what it calls, its shape hash and its trust. No page text.

**Search.** Exact filters on site, inputs, outputs, lasting classes and trust, plus SQLite full-text over name, purpose and ports, which Core already uses elsewhere. No embeddings: the model already in the loop covers paraphrase.

**Run.** One runner for a person and for the model (`run-project-part`, `core.run_part`), built from the existing entry preparation, which already runs saved steps with no model and hands their acts to the ledger. A trusted subflow can run at zero model calls inside an exploration still in progress, and that is how later attempts get cheaper.

**Nesting and sharing.** Nesting already runs. Call Subflow gains a pinned `{ part, version }`, so a site subflow and its action sub-subflow can be used from two places through one execution path. Versions are immutable. A repair makes a new version, and only the caller whose judged run used it moves its pin. Others are told and try the newer version first if they fail there.

**Detection, in order of value.**

1. **Before exploring.** The free opening look gains a shortlist of up to 5 cards, by site first, then text. No added model call. The study's measure: 66% of a brief's decisions came before its first test, which is the ceiling on what a hit saves. The real hit rate is unknown until the Lab's second-attempt lane runs.
2. **At save.** An exact shape hash stops duplicates, so the library does not bloat.
3. **During exploration.** Only later, and only if precision measured offline is good. Generic pages will match, and it needs data not recorded today.

**The rule above all of them: a match only ever produces an offer.** No detector runs anything. A run needs the same site, a true start check (`unknown` fails), its inputs, and lasting classes within what was asked, and it re-checks before its first lasting step. **The worst false match is a fixed value:** a part saved from "add the red shoes" passes every page check on the wrong item. So fixed values are on the card, and a lasting part holding a literal from the person's request is refused from the library.

**Trust** is derived, never set by hand. Reuse `flow-change/confidence.ts`: unproven, then provisional on a judged yes, then established after 2 zero-model runs. A failure drops it. Unproven parts with lasting acts are not offered.

## The Extension

Full detail, with evidence per screen, is in the [extension study](./answer-first-plan/reports/study-extension-ux.md). Chat-first stays, with no split screen, and each step stays visible with its reasoning (both user).

**Words.** The first reply promises the result. Person-facing words become **task**, **automation** and **subflow**; Flow, build, promoted, candidate, trial, judge and Core go (user question 5).

**Working.** A sticky header above the composer: `Working · 1m 12s · $0.34 of $5.00 · [Stop]`. Each step is told once, not up to four times. Routine retries stop being red.

**The answer turn.**

```text
 Found 10 of 10                                   ✓ Checked
 [column | column | column | column]
 [first 5 rows...]                     Show all 10 · CSV · JSON
 On the site: nothing changed
 Checked: right columns, cheapest first, no duplicates
 From: 3 results pages, shop.example  ·  3m 14s · $1.12
 Saved so next time is quicker      [Run again]  [What I did]
```

Its kinds: rows; done on the site, from Core's act record and never the model's prose; a plain answer; partial. Three check states: checked, not sure with no tick, failed.

**Budget out is the only failure, and it has one shape:** "I reached this task's budget. What I got. What I saved. Next: Add budget and carry on." Never a code, never a cut sentence. Everything else that goes wrong shows as a step while it keeps working.

**The second attempt is visible.** "Using what I saved from Tuesday." Steps marked from saved or worked out again. `This time 18s and $0.00. First time 3m 14s and $1.12.`

**Tabs.** Chat and a second tab stay, as the user set on 2026-09-29: **Chat** and **Automations**, with Tasks and Library inside the second, and search across both (user question 5). The library is a tree: site subflow, action sub-subflow, with state, inputs, who uses it, Run and Ask about it.

**Setup.** One screen in order, with state detected: FluxIQ running, signed in, browser approved, model key, each with its exact action. Today these are four undocumented stops, and the model-key button goes to the wrong place.

**Not needed:** a Flow editor, run logs, traces or version diffs in the extension; the top-bar record icon; the unused recording review code.

## Lanes And Phases

Interfaces are fixed by the lead before dispatch, and lanes run in parallel, each on its own paired task. Everything is provider-free unless it says paid. A paid step is announced first and supervised. Browser proof uses the ten realistic scenarios in visible browsers.

**Interface lane (lead, first).** The attempt record, the result record, the act record's shape, the `results` port and the part card. Fixing these first is what lets the other lanes run at once.

**Answer lane (`ui-components`, extension). Can start at once with fake ports.**
1. Truth pass: no codes, no cut sentences, no tick on "not confirmed", red only when it matters, onboarding claims made true, dead code gone.
2. Answer turn and `results` port. Proof: scripted answer on company-website, CSV and JSON, 360 px, keyboard.
3. Real rows from an existing run's dataset. Proof: provider-free run on crossborder-marketplace, oracle rows equal the preview.
4. Work header: time, cost, one Stop, each step told once.

**Exploration lane (Core).**
1. New single-loop path: no trial, reset or dry run; every asked row and page, with D2; row sink; witnesses before the first lasting act and at the end; ends with the result; generic guidance.
1b. **Loop detection** (D14), on its own task, because "keep going" depends on it.
1a. **Keep going until the result:** every ending in "Keep Going Until The Result" converted, each with its own provider-free test. This is the plan's hard requirement.
2. One act record. Proof: a repeat refused across stages; a provider-free probe that "run it" straight after a build no longer repeats silently.
3. One purse per attempt with its reserve.
4. Result record, Flow-less judge, labels, the answer event to chat.
5. **Paid:** one exploration per site, supervised. This is the first real test of "must reach the result".

**Engine lane (Core, domain).**
1. **Go/no-go:** save each gap's reason, then the corpus harness. Stop if it cannot get close.
2. One canonical form; re-measure the 0 of 43.
3. State engine and row computer behind the same socket.
4. Pure verdict; 0 false passes on saved failed runs.
5. Repair tools and flags, scripted first, then paid.
6. Product recording under D12.

**Second attempt lane (Core).**
1. Task key and route (D10). Correct the chat prompt's false claim about drafts.
2. Best-attempt save, notes, seeding, attempt row.
3. Live judged run, repair, carry on to the result, shown as cheaper. Proof: a scripted second attempt spends less than its first.

**Lab lane (extension).** `answerVerdict` beside the Flow's verdict; a double-act oracle; a same-workspace two-attempt lane; a per-attempt report; the Lab's default equal to the product's. See the paired document.

**Library lane (Core).**
1. Provider-free probe of a likely live bug: replacing a part mints new node ids, and a bound output could silently return `null`.
2. Parts marked by the model; card and store written at save; trust read from judgement rows.
3. Search API, reachable from the extension.
4. Run a part with inputs and start check. Proof: refused on the wrong page with no site change.
5. Shortlist in the opening look, `core.run_part`, dedupe at save. **Paid** two-task lane on one site: the first real hit-rate number.
6. Pinned calls, nesting from two places, callers known.
7. Repair isolation.
8. Detection during exploration, only if measured precision is good.

**Extension lane (extension, `ui-components`).** Setup; saved state and second attempt visible; Tasks with search and durable steps; asks told once, with the PIN if the user wants it; the library tree, run and inspect; recording as a composer attachment and settings in order; a Firefox pass, where the popup closing on a page click matters most.

**Prove it.** One task per realistic site, attempt 1 and attempt 2, up to four lanes at once from the extension chat, with the UI reviewed in each loop and a debug note per failure. Then the standing rules are updated, docs brought current and both `main` branches promoted after a passing sweep.

## Schedule

Cut for parallel lanes, each date with its real constraint. MVP deadline: 2026-11-10.

| Date | Work | What constrains it |
| --- | --- | --- |
| 11-03 | t854 merged. Plan reviewed | The user's answers |
| 11-04 | Sweep of the fixes, then promote to `main`. Interfaces. Answer, Exploration, Engine go/no-go and Lab lanes start | Full suites: two a day |
| 11-05 | Answer turn and header merge. Act record and purse merge. Second attempt and Library cards start | The go/no-go result decides the Engine lane |
| 11-06 | Exploration path merges. **First paid explorations** | Live rounds wait for agreed changes to merge |
| 11-07 | Second attempt merges. Canonical form and engine merge. **First full two-attempt loop live** | Each failure needs a debug note before its next run |
| 11-08 to 11-09 | Rounds, fixing forward. Library search, run and shortlist. Setup, Tasks and library tree | Up to four live runs at once |
| 11-10 | Acceptance, sweep, promote | A sweep must pass on the final commit |

**Honest read.** The core loop working end to end in about four days is realistic if the go/no-go passes and the first paid explorations mostly reach their results. These two are the real checkpoints, and the lead will restate this after each. **Likely to land after 11-10:** pinned sharing across Flows, repair isolation, detection during exploration, the Firefox pass, and a hidden-browser simulator tier if it is wanted at all.

## Standing Rules This Changes

The user agreed on 2026-11-03. `AGENTS.md` carries the new rules now, and memory and code comments follow as each lane lands.

| Rule | Today | Proposed |
| --- | --- | --- |
| "Build the whole Flow first; test it whole only when it should work" | A live whole test inside the build | One live exploration; the draft is tested in simulation; the first whole live run is the next real attempt |
| "A finished Flow needs one judged whole run" | Stands | Stands, and moves to attempt 2 (D4) |
| "A failed test is repaired live on the failing step" | In the build | Stands for live attempts; a draft's test failure is repaired in simulation |
| "Not doable only if absolutely no way" | A build may end as not doable | Gone: only the result or the budget ends a task |
| "Every node retries", "stale target found again", "judge the change", permission gates, ten realistic scenarios, guidance never teaches to the test, lasting acts never repeated | Stand | Stand, and matter more |
| Claude live tests "$5 per build" | Per build | Per attempt (user question 2) |
| "Only a few tasks run fully end to end" | About one per site | Stands, as two attempts per task |
| Memory: generalise rather than run every iteration | Stands | Stands, through D2 |

## Risks

- **Repeating a lasting act.** The highest consequence. D1, D2, D6, the Lab's oracle. An undeclared lasting press can still slip through, and this stays disclosed until covered.
- **Exploration not reaching the result.** The budget may run out first. Then the person gets the best result so far and a saved draft, and D2 is what keeps long tasks affordable. Unknown until the first paid round.
- **Spending the whole budget on the impossible.** A consequence of the hard requirement. The meter and the $5 default bound it, loop detection (D14) stops the worst of it, and stalls are visible in chat, so a person can press Stop.
- **Loop detection firing on real work.** Stopping a legitimate long job would be worse than the loop. Progress is measured from new state and rows, and the detector is replayed over saved runs before it ships.
- **The simulation rule may not validate.** The go/no-go exists for that, and the loop still works without it.
- **Attempt 2 failing often.** Live time moves rather than vanishes: live trials were 31% of build time, and a failure costs the person a second real run. The simulated-pass, live-fail rate will show it.
- **A wrong answer shown as right.** D9. A pure verdict can also pass a Flow that repeats exploration's mistake, since the reference rests on one live judgement.
- **A wrong subflow on the right page.** Fixed values on the card, and offers only.
- **Page data in recordings.** D12 must land before product use.
- **Failed exploration has no reference.** No simulation then; the draft stays unchecked and says so.
- **Old pass rates stop being comparable.** Report the two scores separately and never blend them.
- **Eight days.** If time runs short, the order to give up is: during-exploration detection, repair isolation, pinned sharing, Firefox, then repair in simulation. The answer in chat, one exploration, the act record and the second attempt are what must land, because they are the product.

## Work Ledger

### 2026-11-03 - Discovery, three studies and the plan

- Agent: lead; four read-only workers.
- Changed: this document, its paired document and `answer-first-plan/reports/`. No source.
- Validation: lead checked `authoringMode` in `lab-runs/2026-11-03/*/snapshots/flow-lane.json` -> `legacy` on all three, and `AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT` -> `project`. The studies' measured figures are theirs; each lists what it verified, measured and inferred.
- Outcome: plan shown to the user for review.

## Open Questions

**Answered by the user, 2026-11-03:** question 4 (no PIN on normal actions; see D13), question 6 (the definitions are right), and that "internal state engine" means the offline tester.

**Going ahead on the lead's recommendation unless the user overrules it:** questions 1, 2, 3 and 5 below.

1. **Stop using the project supervisor by default, in favour of one exploration loop?** Recommended: yes, keeping its code for large multi-site builds later (D7).
2. **What should a budget cover, and at what default?** Going with: per attempt, covering everything, $5 in the Lab and the product, with a visible meter. The lead first suggested $2 for the product, but budget is now the only failure ending, and $1.12-$1.89 was measured, so $2 would decide too many outcomes. Today AGENTS.md says $5 per build and the product default is $0.25.
3. **How should subflows get cut?** Recommended: the model marks them as it writes, and a person can say "save this". Scoped to one project for now.
5. **Words and tabs.** Recommended: "task" for what was asked, "automation" for what is saved, "subflow" as the user says it, lifting today's ban on that word; and keeping the two tabs from 2026-09-29, Chat and Automations, rather than the slide-over the study proposed.
Decided by the user's messages of 2026-11-03, recorded here so it is not asked again: a result does not need a finished Flow, there is no live re-test inside attempt 1, and a task ends only with its result or its budget gone.
