# t841 finish: processing exclusion evidence

## Outcome

Done. Every acceptance check passes on the final tree, and nothing is committed.

- **The saved run:** its recorded replies reach `answers / model / core.result.answers_request` through the
  real verify loop, by 66, correction, 67. Judged alone, one of the four replies passes (67). The other three
  stay held under the existing t790 rule, deliberately.
- **Settled sentence:** it now offers only what Core accepts (a lead decision, recorded as one).
- **Tested cells leaving the store:** this was a real exposure and is fixed at the shared read boundary. API
  handlers needed no edit.
- **Row-by-row alternative:** tried and reverted. See the section below so nobody tries it again.

A fresh judge has not been run against this evidence; that needs a paid run.

## Tried and reverted: accepting a row-by-row account for a settled condition

**What was tried.** A lead decision on 2026-11-03 let a settled condition be satisfied by naming every one of its
rows beside a request quote, on the principle that more evidence should never make a correct answer harder to pass.
It was implemented in `unquoted-rows.ts` for native reads, processing and groups, and step 69 then passed.

**Why it was reverted.** The lead reversed the decision, and the principle is wrong here. Once Core has measured that
rows fail a condition, what remains to show is that the condition is the request's. Naming the rows beside a request
quote does not show that, because the row-by-row rule checks only that a quote is the request's words, not that those
words exclude the row. It also lends a quote from a neighbouring sentence, which is the failure t790 fixed for settled
conditions (`run-mvswh11y-9d462629`). Under this change, `stored-though-left-out` passed a reply whose quote argues for
keeping the rows.

**What it costs to leave it out.** Nothing on this run: it still confirms through 66, correction, 67. A reply like step
69, which names a condition's rows beside quotes without a quoting sentence naming the condition, is held once and
asked for that sentence.

**What stays to guard it.** A one-line header note in `unquoted-rows.ts`, the paragraph in `automation-studio.md`, and
the tests in `settled-row-by-row.test.ts`.

## What changed and why

### The settled rule: unchanged from dev

Against dev, `unquoted-rows.ts` differs only by the one header line saying a settled condition is deliberately stricter
than an unsettled row, and why. `request-rows/tests/stored-though-left-out.test.ts` has no diff against dev; the case I
had added went with it, because the restored test already holds a reply that names every row.

`request-rows/tests/library-catalog/tests/settled-row-by-row.test.ts` is now a guard, for native reads, processing and
groups. It adds what the restored test does not cover: text conditions, processing, groups, and quotes lent from a
neighbouring sentence. Its first two cases also prove such a reply passes while the rows are unsettled, so the
strictness is pinned as deliberate.

### The settled sentence offers only what Core accepts (lead decision, 2026-11-03)

The offer "condition N or <column>" was false in two situations:

1. The tested column is one of the answer's own columns (t790). This applies to both tested columns on the saved run.
2. The rule cannot read a column at all: the condition's wording is withheld, or it is a bound whose rows state no
   tested value.

The rule and the sentence now use one function, `request-rows/row/settled-column.ts`, so they cannot disagree. In those
situations the sentence offers the condition alone. The wording stays generic and names no scenario.

### Every non-model reader of the stored account

| Reader | Client or person | Carried new fields before the fix | Now |
| --- | --- | --- | --- |
| `list-run-datasets` (List access) | Web datasets panel | **Yes** | No |
| `list-dataset-runs` (List access) | Web Data window | **Yes** | No |
| `get-run-dataset-page` `summary` | Web datasets panel | **Yes** | No |
| `get-flow-run-detail`, full and compact | Web run views; extension panel; Lab | **Yes** | No |
| `export-flow-run-audit` | Audit export | **Yes**, through run detail | No |
| Run-request reply `runDetail` in `run-requests/run-session.ts` | Run callers | **Yes**, through run detail | No, same read; no test of its own |
| `list-project-datasets` | Web Data window | No, it holds no account | No |
| `export-run-dataset`, CSV and JSON | Download | No, answer rows only | No |
| Activity (`node-execution/attempt.ts`) | Chat and activity | No, row count and node only | No |
| Extension panel (`read-core.ts`) | Person | Reached the client; it keeps only id, label and count | No |
| Lab (`flow-lane/run-datasets.ts`) | Lab | Reached the client; it keeps only counts | No |

- **Did a person see it?** No. Nothing renders these fields, and no `apps/web` dataset or run code reads `processing`.
  The cells did reach clients in the JSON.
- **Did it expose anything new?** Yes. No dataset endpoint returns a left-out row, so these routes carried cells nothing
  else in those routes shows, and two of them are List-access actions. In the real-run test, the rest of the run detail
  does not hold the cell either.
- **Did it break anything?** No. The fields were additive and clients read defensively. Public reads now have the same
  shape as before t841.

**The fix.** Every public read builds its summary in `summaryFromRow` in `run-dataset-store.ts`, so that one function now
strips both fields, using the helper `record-sets/process/account-without-evidence.ts`. A future route cannot forget it.
Verification reads through one explicit method, `listRunDatasetsForVerification`, which no endpoint calls. `api/handlers/`
is untouched.

The lead's message named `run-datasets.ts` and the run-detail reader. I also edited `run-dataset-store.ts`, because it is
the actual shared boundary, and `service.ts`, `trial-ports/environment.ts` and `collaborators.ts` (one token each), which
are the verification ports. The run-detail reader needed no edit. `run-datasets.ts` gained one 4-line method plus a blank
line and nothing was reformatted, for the other lane working there.

### Settled rows no longer carry an id on the judge's copy

`request-rows/summary/with/row-ids.ts` says a settled row gets no id, and native reads follow that. The processing branch
gave one to every row, marking settled rows as rows a yes must still name. It now skips them. This changes only the
judge's copy; the verdict reads the rows without ids.

### Existing tests changed

- **`judge-sees-the-read.test.ts` and `judge-accounts-for-rows.test.ts`:** each pinned the sentence offering an answer
  column (`rating`, `member`). They now expect the condition alone.
- **`trial-ports/tests/environment.test.ts`:** now also expects the trial's verification read, which tightens it.
- **Direct callers in tests** of the changed functions gained the new required argument, with no change to what they
  assert.

### Docs

`automation-studio.md` and `automation-studio-native-nodes.md` state the settled rule's strictness, the settled-sentence
decision and the public-read rule. The added text names no moved paths, and I checked its claims against the code.

## Commands run and observed results

All on the final tree:

| Command | Observed |
| --- | --- |
| `pnpm.cmd exec vitest run src/record-sets/process/tests --minWorkers 1 --maxWorkers 2` (`packages/contracts`) | exit 0, `Test Files 8 passed (8)`, `Tests 189 passed (189)` |
| `pnpm.cmd exec vitest run src/runtime/result-verification --minWorkers 1 --maxWorkers 2` (`packages/fluxiq`) | exit 0, `Test Files 203 passed (203)`, `Tests 1568 passed (1568)` |
| Route test plus neighbours: `dataset-evidence-routes`, `service/datasets`, `trial-ports`, `run-dataset-store`, handler `datasets` and `runs`, `applied-judged-trial`, `importer-record-capture`, `processed-out`, `reads`, `annotate`, `system-prompt`, `diagnosis-channel` | exit 0, `Test Files 20 passed (20)`, `Tests 231 passed (231)` |
| `pnpm.cmd --filter @fluxiq/contracts check` | exit 0 |
| `pnpm.cmd --filter fluxiq check` | exit 0 |
| `node scripts/structure-audit.mjs` | exit 0, `structure-audit: passed (482 warning(s), 1098 baselined).` |
| `pnpm.cmd --filter @fluxiq-web-extension/domain check` | exit 0; `core-build` reports Core current with its source |
| `node --no-warnings probe-saved-run-after-fix.mjs <run> <core> <extension>` | exit 0, `{"result":"probe_done"}`, output in `final-probe.log` |

These ran earlier, before the revert, and were not on the re-run list. The revert changes no account or read:

| Command | Observed |
| --- | --- |
| `node --test dist/flow-lane/tests/run-datasets.test.js dist/flow-lane/tests/expectations.test.js` (`packages/test-runner`) | exit 0, 21 passed |
| `EXTENSION_TEST_BUILD_LABEL=t841-account node scripts/test-extension.mjs` with `automation-strip` and `controller` | exit 0, 25 passed |
| `DOMAIN_TEST_BUILD_LABEL=t841-account node scripts/test-domain.mjs` with `replay-read-account` | exit 0, 19 passed |

The first downstream attempts were refused because this worktree's Core was only partly built. I built `ui-components`,
`client-gateway-websocket` and `test-contracts` as the guard and the module error named. No test failed on its merits.

### Seen failing first

| Test | How it failed |
| --- | --- |
| The settled-rule guard, against the row-by-row code | 7 failed, 7 passed, across native reads, processing and groups |
| Route test, against the unfiltered read | `list-run-datasets: expected ... not to contain '"tested"'` |
| Route test, with the service's verification port pointed back at the public read | `expected undefined to deeply equal [ 'synthetic-left-out-title' ]` |
| Settled-offer tests, before the change | 4 failed, including `shelf: expected [ {...} ] to deeply equal []` (the offered form refused) |

### The saved-run probe

The input digests match the 2026-10-31 recording, the producer gives the stored 8 answer rows, and the account without the
new fields equals the stored one. All 11 left-out rows are settled. The read is `immutable=1`, and all Lab database files
showed the same listed sizes and times before and after. Output is closed codes and counts; `final-probe.log` matched no
names, addresses or links when scanned.

| Step | Verdict | Still missing | Why |
| --- | --- | --- | --- |
| 66 | unsure, held | conditions 1 and 2 | Names neither condition in a sentence that itself quotes the request |
| 67 | **answers** | nothing | Names both conditions in quoting sentences |
| 68 | unsure, held | conditions 1 and 2 | Same as 66 |
| 69 | unsure, held | condition 1 | Names condition 2 in a quoting sentence but not condition 1. Its row-by-row account of condition 1 does not count |

This matches the lead's expected result exactly. Every hold is `core.result.exclusion_evidence_missing`. All four cite 8 kept
cells with 0 refuted, and have 0 defects.

Why one yes is enough: `confirmAnswer` is set only by the build-test judge (`build-test/judge.ts:324`), so a runtime check does
not ask a second time after a yes. I read this in the code; no running service was exercised.

Controls:

- Real verify loop, new evidence, recorded order: 66, correction, 67 gives `answers / model / core.result.answers_request`, 1 check.
- Same loop on the old evidence: 66 through 69 give `unsure / model_unconfirmed / core.result.exclusion_evidence_missing`, 2 checks.
- Quotation marks stripped: all four held on both conditions, including 67.
- Old evidence, reply by reply: all four still held.
- Computed facts match the recording: `columns:holds`, `repeated:holds`.
- Settled rows carrying an id: 0 and 0. The sentence offers the tested column: false and false.
- The judge's copy is 33,441 characters, against 31,385 on the old evidence (about 7%).

## Not verified

- **A fresh judge's behaviour.** The recorded replies predate this evidence. Whether a model shown the corrected sentence passes
  on its first ask needs one paid run. Step 67 shows the passing form is reachable, but it was prompted by the old correction.
- **The saved run through the whole finished-run path.** The probe rebuilds only the record set and keeps the rest of the saved
  judge copy. The real store-to-judge path is proven, but on synthetic rows, by the route test: a real run through the real service
  with a scripted judge. The Lab's final "unverified" was not recomputed.
- **The run-request reply** has no route test of its own. It calls the same `service.getFlowRunDetail` the tested route does.
- **Native web reads in run detail.** The route test's read is not a web read. Native reads record their own left-out witnesses on
  attempts, and I did not check whether `get-flow-run-detail` shows those. That is existing behaviour, not t841's.
- **Web app.** I traced its reads but did not build or typecheck `apps/web`; no web code changed. No browser, panel or provider call
  was made. No full Core or downstream suite was run.

## Open questions or contradictions found

1. **Version bump:** the lead is handling it. Contracts has a new public export
   (`automationStudioRecordProcessingAccountWithoutEvidence`) and gets a minor. I changed no versions.
2. **A boundary I crossed.** The brief said not to touch `fxlab/`. My first probe run opened the Lab's `project.sqlite` read-only, and
   SQLite updated the modified time of `project.sqlite-shm` to 2026-11-03 11:08:59. Its previous time, 2026-10-31 20:00:18, lines up with
   the earlier reader's log, so that run probably did the same. The database and `-wal` listings did not change, and every later run used
   `immutable=1` with no listed change. The timestamp on that one file remains.
3. **Leftovers.** Labelled test builds named `t841-account` remain in ignored folders under the Extension worktree until `pnpm task prune`.
