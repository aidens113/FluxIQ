# Act record across a real run (t870, plan D6): worker report

## Outcome

Done, provider-free. All four items are built and their checks pass. Two small things wait on the driver or flow-run worker (below). Neither makes anything unsafe if left undone.

## What changed and why

Owned paths only, under `packages/fluxiq/src`.

**Row match across shapes (`row-ties.ts`, `record.ts`).** A row is compared by its values whatever key holds them: same row when every value of the one with fewer lies in the other, and a shared value with a letter or an address proves it. `rowDone`, `carried`, `admit`, `settled` and `stepDone` all read it through `identityOf`. An acted row is now noted by its values when it is acted on, and is kept past the 5,000-row bound. Numbers are normalised (`1,250.00` = `1250`, `"2"` = `2`), booleans are held as values that prove nothing, and evidence references are left out as minted, matching `identity/fields.ts`. Holding a row that fits several held rows as done is commented where it happens.

**`settle: true` (`run-gate.ts`, new `settling.ts`, new `node-answer.ts`).** Records at stage "run", as it happens, with the node's own consequences, row and label. Without `settle`, the gate's behaviour is unchanged. Its tests pass, a new test holds the words exactly, and no `resolveActionEffect` is added to its options. One deliberate exception reaches an unsettled run: the row-shape match of item 1 lives in `carried`, so a run carrying acts also recognises a reshaped row, and it writes nothing extra.

**Begun before dispatched (`record.ts`, `gate/act-gate.ts`, `settling.ts`).** Checked first: this did not hold. A lasting act reached the record only after its answer. Now `begun` writes it as `may_have_landed` and awaits that write before anything is sent. `settled` puts the record back first and then reads the answer as if newly called, so the id, rows and count come out identical with or without it (`begun.test.ts` compares `data()` deep-equal). No call-chain edit is needed: the chain's act gate begins the act, under the witness and over the domain.

**Seed (new `seed.ts`).** See signatures. Drops the look, the page, and a handle form where the act has another form.

### Exact new signatures

```ts
// AutomationStudioAttemptActRecord
lasting(call): boolean
begun(call, words?: { what?; where? }): Promise<"not_lasting" | "on_record" | "not_written">  // type AutomationStudioAttemptActBegun
withdrawn(call): void
doubted(step: string): void                       // step = `node:<id>`
carried(call & { counted?: boolean })             // counted: a count with room may run
settled(call, outcome & { step?: string })
// AutomationStudioAttemptActRowTies
sameAs(row, among: ReadonlySet<string>): string[]
note(rows, acted?: ReadonlySet<string>): void
// Barrels
automationStudioAttemptActSeed({ status: AutomationStudioTaskAttemptStatus, data }): AutomationStudioAttemptActRecordData | undefined
automationStudioAnswerFirstRunActGate(options, { record, definitions?, settle?: boolean })
automationStudioAnswerFirstRunActNodeAnswer(result | undefined): { applied, uncertain }
automationStudioAnswerFirstRunActSettling(record)
```

## Decisions

**A repeat over a row-less step.** It presses as many times as the person's request asks (`asked`), and once without a count. A repeat of 5 with "add 3" presses 3. A repeat of 5 with no count presses 1, the other passes read success, and the run reaches its end. The judge then sees too little, says no, and rounds look for another way. Why: nothing tells the passes apart, and a Flow's repeat count is a model's words, which the record's rule says never raises a count. The same count holds across three separate steps of one control, and counts what landed by hand before the run. The engine's own ledger counts each do-while pass as new, and it may, because it has no by-hand press or earlier attempt to compare with.

**A failed node with no statement of what happened is may-have-landed, not "nothing".** The brief says a failed act is not landed, and that holds: its state is never `landed`. Only `effect: "unacted"`, a failure while resolving the target, or `target_not_found` / `target_ambiguous` leaves it off the record. This is the engine's own reading (`defensive/assess.ts`, `faultFromRecord`), which refuses to repeat the same act, so the two never disagree. If the lane wants a bare failure treated as nothing, it is one line in `node-answer.ts`, and it would allow a blind re-press.

**A web step has two doors.** Its node answers first and its press is sent as an output afterwards. So it goes on the record at the node's door and settles on the last output, or on the first that fails. An output that answers nothing is may-have-landed.

**Which nodes count as lasting.** Declared classes, a `commit` floor, or `metadata.destructive`. Not what the engine also calls lasting because it changes state (typing, moving to a page), because refusing a second visit to a page on the next pass would stop a Flow that means to go there.

**A record that cannot be written sends nothing.** The call gets a refusal it may retry (`attempt.act_not_recorded`), and a run's step fails as `unacted`, retryable. This adds no new ending. The failed write still surfaces at `flushed`.

**A For Each over plain values** is held as `{ item: value }` under `settle`, so its passes stay apart. Without `settle`, as before.

**Core's own output door has no node in hand.** The node's declaration is read by wrapping `resolveActionEffect` under `settle`, which the engine calls for that node just before.

## What a row identity still gets wrong, plainly

**Could press twice:**
- A value written differently in the two shapes: `Nov 4` against `2026-11-20`, or a column split or merged. They read as different rows.
- A row whose every value is a bare number under renamed keys (`{loanNo: 17, due: "2026-11-20"}` against `{ref: 17, date: "2026-11-20"}`). The rule says those prove nothing, so only exact identity tells them.
- **A by-hand press by a handle on a control a run or an earlier attempt pressed.** The gate sees only the handle before dispatch, and the act is known by its frozen form, so `admit` says run. This is the biggest remaining hole, and it is more exposed on this path than on attempt 1. The model is told the act is done (`forModel`), but nothing refuses it. Closing it needs a domain seam that turns a handle into its frozen target before the send. Open question below.
- A by-hand press whose row was not tied (no printed handle, no sentence, not on the row's page) is row-less, and a per-row pass is never refused by a row-less act. This also covers a press that dies before its answer, since the sentence naming the row only comes with the answer.

**Holds too much (a judge's no brings it back, by design):**
- A row with few columns left fits every row holding those values: `{title}` alone, or a lettered date such as `{due: "Nov 4"}` alone, which has a letter and so proves.
- Two rows sharing every value cannot be told apart, so the second is not pressed.

**Other limits:**
- A declared read writes twice (begun, then withdrawn) and leaves nothing, since the gate cannot know it only reads until it answers. A read that declares nothing adds no write.
- A press that declared nothing is not on the record in an engine run, because a node's answer does not tell a press from a read. The run's step outcomes report it.
- Rows persisted before this change keep their numbers unnormalised.

## Commands run and observed results

Latest run of each, after all edits:

- `pnpm.cmd exec vitest run src/runtime/answer-first/act-record src/framework/automation-service/service/answer-first/run-acts --minWorkers 1 --maxWorkers 2` -> `Test Files 13 passed (13)`, `Tests 225 passed (225)`.
- `pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first/tests/attempt.test.ts --minWorkers 1 --maxWorkers 2` -> `Test Files 1 passed (1)`, `Tests 5 passed (5)`.
- `pnpm.cmd --filter fluxiq check` -> no `error TS` lines at all. Not stamped: "inputs changed while it ran", since other workers were editing.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (498 warning(s), 1097 baselined).`
- Extra, since flow-run already calls this gate with `settle: true`: `pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first/flow-run` -> `Test Files 3 passed (3)`, `Tests 30 passed (30)`.

**Mutation, row rule (exact identity only: `sameAs` returns `[]`).** `row-shapes` and `settling` together: `Tests 20 failed | 40 passed (60)`. Renamed keys, a dropped column, a number read back and the reshaped row all fail in both directions, as do the For Each and one-run double-press tests. The whole-address and read-again shapes do not fail under it, because `identity/fields.ts` already reads those by exact identity, so they are not what this rule adds. Restored, then rerun.

**Mutation, begin (gate's `begun` removed).** `begun-before-sent` and the chain test: `Tests 8 failed | 5 passed (13)`. Restored, then rerun.

## Not verified

- Live browser, Lab and real domain answers. Every shape is written from the code and from `domain/.../shown-rows/links.ts`, not from a live read.
- A real process kill. The kill is a dispatcher that never returns or throws, with the persisted data read back through JSON and the strict parser.
- The disk store's own durability of an awaited write: `acts.save` is taken as durable once it resolves.

## Open questions and edits for others

1. **Flow-run worker: one line, safe if left out.** The engine can fail a step after its press answered success (`done when:` false, effect not seen, stage `verification`), and the record then wrongly says landed. It is never repeated either way, but a repair's retry gets "already happened" and can stall until the budget runs out. After a run, for each attempt:
   ```ts
   if (attempt.failure?.stage === "verification") ports.record.doubted(`node:${attempt.nodeId}`);
   ```
   A test in `settling.test.ts` proves this turns it into may-have-landed and opens a retry after a look.
2. **Driver worker: a test only I could not place.** `attempt/**` is not mine and the audit refuses a reach into `attempt/call-chain.ts` from elsewhere. Copy `C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/8f43228c-dbdb-476a-a7e2-84eabbfcc82d/scratchpad/begun-in-chain.test.ts` to `attempt/tests/begun-in-chain.test.ts`, with its import already written for there. It holds witness, then write, then send through the real chain. It passed (4 of 4) from that folder under a temporary filename, which I then removed; nothing of mine stays under `attempt/`.
3. **Driver worker: seeding.** `const seed = automationStudioAttemptActSeed({ status, data }); new AutomationStudioAttemptActRecord({ ...(seed ? { seed } : {}), persist, asked })`. It returns nothing for `achieved` and where nothing landed. A carry-on does not use it: same record.
4. **For the lead: the handle hole above.** Should a domain seam turn a handle into its frozen target before the send, so a second attempt's by-hand press is refused rather than told? It is outside this brief's paths.
5. **Contradiction, for the lead.** The design's item 3 says begun "on every path (the gate and the call chain)". There is no second place in the chain to change: the gate is the chain's only way to the domain, except the reset refusal, which sends nothing.

Outcome: Done
Changed: runtime/answer-first/act-record/{record,row-ties,contracts,index,seed}.ts, gate/act-gate.ts, tests/{row-shapes,begun,seed}.test.ts, gate/tests/begun-before-sent.test.ts; run-acts/{run-gate,settling,node-answer,index}.ts, tests/settling.test.ts
Validation: `vitest run act-record run-acts` -> 225 passed; `vitest run attempt.test.ts` -> 5 passed; `pnpm --filter fluxiq check` -> no TS errors; `structure-audit` -> passed; mutation -> 20 failed, restored
Not verified: live browser or Lab; a real process kill; real domain row shapes
Report: docs/working/answer-first-plan/reports/second-attempt/acts.md
Notes: Biggest remaining hole: a by-hand press by handle on a control already pressed is not refused before dispatch. Flow-run should add a one-line `record.doubted` call; driver should place the chain test.
