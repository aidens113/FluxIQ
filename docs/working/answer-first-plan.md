# Answer First

Status: Active
Status detail: Draft, being rewritten after the user's refinement of 2026-11-03: one live exploration, simulation with exact recorded inputs, subflow library, extension UI focus. Not yet shown to the user as a plan.
Created: 2026-11-03
Last updated: 2026-11-03
Owner: Senior supervisor agent
Scope: Make every task end with its result, from a deterministic Flow when one works and from an LLM finishing the job when it does not, while keeping everything needed to make the Flow better next time. Measuring one-shot and two-shot per task. Not a rewrite of the build loop, and it does not relax permission gates or the rule against repeating lasting acts.
Paired document: `docs/working/answer-first-plan.md` in FluxIQWebExtension (the Lab's two scores and the extension side)
Related: [discovery report](./answer-first-plan/reports/discovery.md), [offline trials plan](./trace-offline-trials-plan.md), [Studio controller plan](./studio-controller-plan.md)

---

## Current State

**The idea, in the user's words (2026-11-03):** "Rather than requiring that a deterministic flow is perfectly built, we try building/repairing/using the flow, then using LLMs to get the final result REGARDLESS of whether the deterministic flow works or not. All the important data INCLUDING THE DRAFTED FLOW is saved for later, so next time we try doing that task we can try building/rebuilding/using that deterministic flow part. This way we get the benefits of a pure LLM automation harness AND the benefits of deterministic flows." And: "we'll really need to refine that internal state engine automation tester. That way we can refine flows internally without testing live. Basically I'm trying to make 'one-shot'/two shot systems that adapt and get more efficient over time."

**State.** Planned, not started. Everything in "The Attempt" and "Phases" is the lead's proposal for the user to review. A decision marked "lead" is not a user rule.

**What the discovery established** (file references in the [report](./answer-first-plan/reports/discovery.md)):

1. **The product's output is a Flow, not an answer.** Total success says "Your automation is ready". Rows reach the person only as a download link. So the pivot needs a way to show a result as well as an LLM to finish a task.
2. **No path can end with an answer.** A build can only name a plan or a revision, and a recovery can only return a patch. Rows read while exploring are never stored.
3. **A passing build has usually done the work already, then drops it.** A whole trial's rows sit in the store and its acts stay on the site, and nothing hands them to the person.
4. **Saved drafts are not reused in the default mode.** A project build never loads `candidate-draft.json`, and it is overwritten by the latest. The chat model is still told a saved draft continues.
5. **Lasting acts live in four unconnected records,** two of them memory-only. From reading the code, "run it" straight after a build would press "Add to cart" again; the Lab hides this by resetting the fixture. Not yet proven by a run.
6. **The live runs of 2026-10-31 and 2026-11-03 ran `legacy`, not the product's default `project`.** Lead verified the three of 2026-11-03 from `snapshots/flow-lane.json`. `project` on Claude has one recorded run, which stopped after one call, so its real cost is unmeasured. `legacy` is the Lab's default by design, not an accident; the gap between the two defaults is the finding.
7. **Failing costs about the same as passing,** about $1.10 on Claude, and a product default ceiling of $0.25 cannot pay for that. Money is a design question here, not a detail.
8. **The offline tester has not saved measurable time yet.** Across 12 saved runs: 41 checks, 26 inconclusive, 12 refused for no recording yet, 1 passed, 2 kept failures. It avoided 2 of 61 live test windows, and is off in the product. It cannot prove acts or branches not taken. Its rule that an offline pass is never proof is already enforced and carries over unchanged.

**Blockers.** Three questions under Open Questions change standing user rules, so they wait for the user. P0 and P7 can start without them.

**Next.** Merge t854 and t855, then P0.

## Objective And Measures

An **attempt** is one time a person, or a schedule, asks for a task. A **task** is the same request across attempts (D8).

Proposed definitions, for the user to confirm:

- **One-shot:** the right answer on attempt 1.
- **Two-shot:** the right answer by attempt 2.
- **Flow deterministic:** an attempt reached the right answer with zero model calls.
- **Getting more efficient:** model calls, tokens, dollars, live trials and elapsed time per attempt fall from one attempt to the next on the same task. Report calls and tokens beside dollars, because models and prices change: the $0.03-$0.11 versus $1+ gap in the discovery is mostly the model.

Only the Lab has ground truth, so these are measured there. In the product the same series rests on judge labels and the person's own answer.

**MVP target, proposed by the lead:** across one task per realistic site, the right answer by attempt 2 on all ten and on attempt 1 on most, with no lasting act repeated on any, and a zero-call attempt following on the tasks whose Flow became deterministic. The exact bar is the user's to set after P0's numbers.

## The Attempt

Every attempt goes through the same five stages. Stages 2 and 3 are the pivot.

| Stage | What happens | Exists today |
| --- | --- | --- |
| 1. Route | Pick the saved Flow, the saved draft, or a fresh build | Only a chat model's guess at names |
| 2. Try | Run or build the Flow within its share of the budget. Retries and repair at the failing step work as they do now | Yes |
| 3. Finish | If stage 2 did not produce the result, an LLM carries on from the page as it stands | No. The seams exist |
| 4. Label and show | The person sees the result, where it came from, how it was checked and what was done on the site | Labels exist for runs only; no answer in chat |
| 5. Save | Flow or draft, the attempt's record, its acts and its trace, for next time | Partly, and much is memory-only |

**D1. Two questions stay separate (lead; user question 1).** "Is this answer right" labels a result. "Does this Flow do the task" decides whether a Flow counts as deterministic. A result no longer needs a Flow, and a Flow still needs its judged whole run. The user's rule ("a finished Flow needs one judged whole run as it finally stands") keeps its meaning, and what goes away is the reading "no finished Flow, no result". The run's `failed` status keeps its retry and repair meaning: a label is metadata beside it, as `resultVerification` is.

**D2. For a task with lasting acts, the next real attempt is the test (lead; user question 2).** This is what makes two-shot natural, and it removes most double-acting at the source. Today a build explores live, which lands the act, then re-runs the whole Flow to prove it, then undoes or re-judges around what it did. Proposed:

- **Read-only task.** Testing repeats nothing, so test the whole Flow in the same attempt when the budget allows. The trial's rows are the answer. If its verdict is yes the Flow is finished on attempt 1: one-shot and deterministic.
- **Task with lasting acts, attempt 1.** Exploration performs the acts once, for real, and they count. The Flow is authored from what worked and saved as an unproven draft. The Finish stage closes anything left. The whole Flow is not re-run, because that would repeat the acts on the person's real site.
- **Attempt 2.** The draft runs for real, judged, and that run is its whole-run test. A yes makes the Flow finished. A failure is repaired live at the failing step, as now, and the Finish stage closes the rest. Lab reset rules are unchanged for builds that are asked to prove themselves.

A person can still ask for a Flow to be proven now, using today's reset and judge-by-change machinery.

**D3. The finisher (lead).** A new loop role with `draft: false`, as the supervisor already has, and the normal node tools under the normal permission gate. It ends with a completion of its own: `{ answer, actsDone, couldNot }`.

- **Rows come only from real reads.** The finisher's reads go through `recordBatchHandler`, in a session opened as a trial's is. A model never writes rows. A plain-language answer is stored as the model's words and labelled that way.
- **The same gate as a build.** Deleting, moving money and sending still ask the person. Recovery's narrower "destructive never offered" is not used, or the finisher could not finish such a task; the gate is what protects it.
- **A fresh, small context.** It starts from the task, the page and the act record, not the build's long history. That keeps it cheap and is what makes its budget calculable (D6).
- **It cannot teach to the test.** Its guidance is generic, under the standing rule.
- **Exploration's own reads are kept too,** through the same sink, so a build's work is not thrown away.

**D4. Where the finisher enters (lead).** One entry, four seams:

1. A build ended without a result: draft kept, unfinished, not doable, or out of its budget share (`run.ts`, and the phases' endings).
2. A run failed at a step and in-run repair could not fix it, with the held run's state intact (`incident-repair.ts`).
3. A run was refuted and its repairs did not fix it (`run-outcome.ts`).
4. A Core-computed no with nothing left to try.

A cancelled attempt, a person-only check and a permission refusal do not enter it. Those stay exactly as they are.

**D5. One act record per attempt (lead; user rule).** The rule that a lasting act is never repeated matters more under this pivot. Merge the four records into one, persisted, scoped to the attempt and carried across its stages: `{ what, where, classes, state, row }`. `left-on-target.ts` and `act-ledger.ts` already produce most of it, and the project ledger's unused `persist` hook is the place to start.

- The finisher receives it in its first request, screened, and an identical repeat is refused as `rerun-check.ts` does.
- The finisher looks at the page before it acts on anything the record says may have landed. Identity across build, trial and run is unsolved: they key by call, step stamp and node plus row. A repeat that looks different to the code is possible, and the Lab needs a double-act oracle to catch it (P7).
- Re-runs from the start stay declined when a stated lasting act may have landed (t848, t854). An undeclared lasting press is not caught by that check today, and stays a disclosed limit until the act record covers it.

**D6. One budget per attempt, in order (lead; user question 3).** One purse wraps the attempt, with the Flow's share, then repair, then a held-back reserve for the finish and for judging. The mechanism exists: `keepBackForJudging` and `allowance()`. Because the finisher starts from a small context (D3), its reserve can be N calls at a bounded worst case. Replies stay uncapped, under the user's rule, so a breach is possible and is recorded as now. A refused call ends the finish with what it has, labelled partial. The same split applies to time, so the Flow's share of an attempt leaves time to finish.

**D7. Honest labels (lead).** Reuse `confirmed`, `refuted` and `unverified`, and say where a result came from: a Flow, an LLM finish, or both. A label from one judge call says it was checked once. t296 is why: one yes once finished a build on wrong rows, so a label must never overstate. The judge needs a Flow-less summary (rows, acts, end view). The discovery calls this the largest single change in verification.

**D8. Which task is this (lead).** Running a saved Flow on a guess spends real acts, so only an exact instruction digest, or the person naming the Flow, may run one. A paraphrase is a new attempt that may use a related draft as a seed, which is safe because the build re-checks it. A semantic match can come later if it is worth another model call.

**D9. Save what the next attempt needs (lead).** An attempt record `{ task, attempt, path, calls, tokens, usd, ms, liveTrials, offlineChecks, label }`. The best-judged draft beside the latest, which today overwrites it. Builder proposals, which are memory-only and lost at the end of a build. The act record. The trace, once tracing is decided for the product (P8).

**D10. Results in chat (user rule; lead for the shape).** The chat is the product and renders from `@fluxiq/ui-components`, so an answer turn with a rows preview and export goes in the shared package and both clients get it. It shows only what the person's own session already saw, and recorded page data never goes beyond that.

**D11. Which build path (lead, decided by P0's numbers).** The pivot should sit on the path the product runs. P0 measures `project` against `legacy` on Claude on the same tasks. Afterwards the Lab's default and the product's default are the same.

**D12. The tester's job (lead).** Offline trials refine a draft between attempts wherever they can answer, mostly read and computation changes, and never count as proof. They do not gate the MVP, because the attempt works without them and their benefit is unproven. See P8.

## Phases

Interfaces are fixed by the lead before dispatch, then lanes run in parallel, each on its own paired task. Every phase is provider-free until P9, and every model-facing line stays generic.

**P0. Measure and prove (first).**
- Provider-free probe of the double-act finding: a build whose whole trial presses a lasting step, then "run it", counting presses through the real service. Keep it as a test.
- Paid, supervised, one round: the same two tasks in `project` and in `legacy` on Claude, recording calls, tokens, dollars, time and verdict. The lead states what will run before it runs. This also gives a baseline before the pivot.
- Save why each offline check was inconclusive (`meta.json` says only that it was). This is the cheap first step in the tester's own measurement.
- Done when: the probe's answer, the cost table and D11's decision are in the ledger.

**P1. Show the answer (Core and `ui-components`).** An attempt result record; an answer turn in chat with rows preview and export; a passing build's trial rows become the answer; "run it" shows its rows. Tell the person what is on the site. This needs no finisher and is already a real gain.
- Done when: a provider-free build and run end with their rows in chat, proven headed on a realistic site.

**P2. One act record (Core).** D5. Done when: the P0 probe's double act is gone, the record survives a restart of the attempt's stages, and a repeat is refused across stages.

**P3. The finisher (Core; needs P2's and P4's interfaces fixed first).** D3 and D4: the role, the completion, the row sink and the four seams, with exploration's reads kept. Done when: for each seam, a scripted model finishes a task from the page a failure left, on the real store, with its rows stored from reads and nothing repeated. Includes a test that a model-written row cannot get in.

**P4. One purse per attempt (Core).** D6. Done when: a Flow share that runs out leaves the reserve whole, a finish spends it, and a refused call ends in a labelled partial result.

**P5. Labels (Core).** D1 and D7: the Flow-less judge summary, labels as metadata, a Flow's gate unchanged. Done when: a wrong answer from a finish is labelled refuted, and the gate still refuses an unjudged Flow.

**P6. Route and reuse (Core).** D2, D8 and D9: task key, route ladder, seed a build from the saved draft in project mode, keep the best-judged draft, keep proposals, read-only versus lasting tasks. Correct the chat prompt's false claim about drafts. Done when: a second attempt on a scripted site starts from the first's draft and spends less.

**P7. Two scores and the second attempt (Extension; can start now).** See the paired document: `answerVerdict` beside the Flow's verdict, an oracle stage before any reset, a double-act oracle, a same-workspace two-attempt lane and a per-attempt report.

**P8. The tester (both repositories; does not gate the MVP).** In order, each decided by the one before:
1. P0's saved reasons show why checks come back inconclusive.
2. The planned off/on comparison, on Claude, which has never been run.
3. Look up the latest trace by Flow, and decide about tracing in the product: about 11.5% overhead, plus page data kept.
4. A repair role over a scoped environment that answers from the recording. Reads need the snapshot page host, deferred until after the MVP because it needs a hidden browser in the person's panel; that was a supervisor decision the user can overrule.
5. When it runs. Model calls still cost money between attempts and paid work is never unattended, so it runs at the start of the next attempt or while the person's task is live.

Acts and branches not taken cannot be proven offline, so read and scrape tasks gain the most.

**P9. Prove it live.** One task per realistic site, attempt 1 and attempt 2, up to four lanes at once in visible browsers from the extension chat, with the extension UI reviewed in each loop. Each failure gets a debug note, and is fixed forward. Then the standing rules are updated in `AGENTS.md`, the docs are brought current, and both `main` branches are promoted after a passing sweep.

## Schedule

Cut for parallel lanes, with each date's real constraint named. MVP deadline: 2026-11-10.

| Date | Work | What constrains it |
| --- | --- | --- |
| 11-03 | Merge t854, t855. Plan reviewed | The user's three answers |
| 11-04 | P0. Sweep of today's `dev`, then promote to `main`. Interfaces fixed. P1, P2, P4, P7 start | Full suites: two a day. P0's paid round needs supervision |
| 11-05 | P1, P2, P4, P7 merge. P3, P5, P6 start | P3 waits on P2's and P4's interfaces only |
| 11-06 to 11-07 | P3, P5, P6 merge. First live round | Live rounds wait until agreed changes are merged |
| 11-07 to 11-09 | P9 rounds, fixing forward | Up to four runs at once; each failure needs a debug note before its next run |
| 11-10 | Acceptance, promote | A sweep must pass on the final commit |

Whether this holds depends on what P0 and the first live round find, so the lead will restate it from each. P8 beyond its first two steps may land after 11-10, which does not affect the attempt working.

## Risks

- **Repeating a lasting act.** The highest consequence. D2, D5, the P0 probe, the Lab's double-act oracle. A press nobody declared as lasting can still slip through, and this will be said plainly until it is covered.
- **A wrong answer shown as right.** D7: label what was checked and how, and keep two questions separate. Rows only from real reads.
- **A finisher with broad reach on a real site.** The same permission gate as a build and the same secret screening. It sees only what the session saw.
- **Cost.** Tasks cost more until a Flow works. $0.25 cannot pay for it on Claude, and `project`'s cost on Claude is unknown until P0.
- **A site dirtied by attempts.** Final-state oracles are absolute today, so a finish on a used site may read wrong. Seeded baselines per attempt, and judging by change as the standing rule says.
- **Old pass rates stop being comparable** once there is a first score. Report the two separately and never blend them.
- **Scope in eight days.** P1 is valuable alone, and P3 is the heart of it. If time runs short, P6's reuse and P8 give way first, because attempt 1 still works without them. The result would then be one-shot without the efficiency curve. That is a trade the user should see before it is made, and it will be raised then.

## Work Ledger

### 2026-11-03 - Discovery and plan

- Agent: lead; discovery by a read-only worker.
- Changed: this document, its paired document and `answer-first-plan/reports/discovery.md`. No source.
- Validation: `grep` of `coreAuthoringMode`/`authoringMode` in `lab-runs/2026-11-03/*/snapshots/flow-lane.json` -> `legacy` on all three runs; `AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT` -> `project`. The discovery's other claims are its own; its inferred items are marked [I] and listed at its end.
- Outcome: plan ready for the user's review.

## Open Questions

For the user. Each changes or re-reads a standing rule, so it waits for an answer. The lead's recommendation is the first option.

1. **Does a Flow still need its judged whole run to count as deterministic, while a result does not?** Recommended: yes, D1.
2. **For tasks with lasting acts, may the next real attempt be the Flow's whole-run test, instead of re-running it in the same attempt?** Recommended: yes, D2. This narrows "a finished Flow needs one judged whole run" only in timing: the draft is not finished until that run.
3. **What should the ceiling cover, and at what default?** Recommended: one purse per attempt covering Flow, repair, finish and judging, keeping $5 for Claude in the Lab, with the product's default set from P0's numbers. AGENTS.md says $5 per build, the Lab's purse spans the whole Flow including playback, and the product default is $0.25.

Also worth a line from the user, though nothing waits on them: the definitions under Objective, and whether "internal state engine automation tester" means offline trials. "State engine" appears nowhere in either repository.
