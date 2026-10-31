# Accepted continuation history through t816

Verbatim ledger entries moved during the P5b continuation; decisions and validation retained.

### 2026-10-29 - P1a: bookkeeping folded outside the trial gate (t806)
- Agent: supervisor (brief t806-p1a), four workers; report `../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/t806-p1a.md`
- Changed: `llm/unknown-tool/` refuses an unknown tool id with the offered ids and the nearest match, counted by the refused-in-a-row guard; `project-agents/brief-defaults/` fills a brief's missing `kind`, `parts` and repair `failingReceipt` (never over the model's), `project.repair_unchanged` checked first, `kind` optional in the dispatch schema; `flow-bootstrap/unchanged-fix-point/` gives the first `unchanged_after_no` its diff and fix point; `activity/folded-reason.ts` lets Core write a folded step's line (P1b calls it); `ending-told.ts` composes an empty done reason from the record.
- Validation: lead-run under the lock, merged with dev: tsc clean; `pnpm test` over llm, project-agents, candidate, unchanged-fix-point, activity, project-build-ending, service-bootstrap -> "Tests 3522 passed (3522)", real-sql "Tests 142 passed (142)", "all groups passed"; prompt contracts "Tests 122 passed (122)"; `pnpm check` exit 0; docs current; structure passed (`provider-stopped.test.ts` fails only when run alone, "No test found in suite", and passes in its group).
- Outcome: Accepted. `supervisor/guidance.ts` still names `kind` as required (pin-sensitive; left for P1b).

### 2026-10-29 - P7 follow-ups: day-granular within, record defaults plumbing (t807)
- Agent: supervisor (Sonnet) with three workers; report `../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/t807-p7-followups.md`
- Changed: `contracts/.../date-within.ts`: a day-only value under a `within` bound in days or weeks compares by whole UTC days (minutes and hours stay instants); `llm/node-tools/{replay-draft,dry-run-gate}.ts` accept the plan part that owes records (callers in `evidence-loop.ts`, `single-subflow/rebuild.ts`, `supervisor-loop.ts` wired with P1b); the web picker keeps `mark` (downstream).
- Validation: lead-run under the lock, merged with dev: contracts `vitest run src/record-sets` -> "Tests 259 passed (259)"; `pnpm check` exit 0; `pnpm test` over record-defaults, node-tools, plan, candidate, result-verification -> "Tests 2205 passed (2205)", real-sql "3 passed"; docs current; structure passed.
- Outcome: Accepted.

### 2026-10-29 - A failed build test is repaired from its failing step (t804, user rule)
- Agent: supervisor; worker-heavy trace, runner, gate; worker headed spec; lead fixes (fromStep through `service/project-build/subflow-trials.ts`, read-only at construction; the refusal code by constant); report `../!FluxIQWebExtension/docs/working/framework-heavy-lifting-plan/reports/t804-repair-from-step.md`
- Changed: `core.test_subflow` takes `from: <step key>` and runs the latest revision from that step on the page as it stands (no reset, earlier steps or judge; never the part's test); a failed whole test leaves a pending repair, and another whole test or a completion is refused `subflow.trial_from_step_first` (naming the step and the call) until a from-step run passes it, unless the builder says why one is impossible. P1b shape: `then: "test_whole" | {from}` on `core.submit_subflow`.
- Validation: lead-run under the lock, merged with dev (t806 in): tsc clean; `pnpm test` over subflow-candidate, plan, verification, candidate, service, project-agents, llm -> "Tests 4821 passed | 2 skipped", real-sql "346 passed"; `pnpm check` exit 0; headed `e2e/site-reset/tests` -> "33 passed (35.9m)" with `photo-repair-from-step.spec.ts` counts `{"wholeRuns":2,"fromStepRuns":1}`.
- Outcome: Accepted. Follow-up (P1b): `from` also takes the step label the model wrote.

### 2026-10-30 - Codex independent P6 acceptance (t799)
- Agent: Codex lead
- Validation: owning recovery/toggle/handler/pace Core batches -> `15 files / 84 tests passed` and `12 files / 151 tests passed`, both configured groups exited 0. See paired downstream `framework-heavy-lifting-plan/reports/codex-1030/t799-result.md`.
- Validation: `pnpm.cmd --filter fluxiq check` -> exit 0, content-matched source/test check reused; `pnpm.cmd docs:check` -> `Deterministic framework reference is current.`
- Validation: downstream native headed Chromium photo-social installed-extension proof -> `1 passed (3.7m)`, no paid calls; downstream owning tests/types passed after correcting its legacy-input test fixture.
- Not verified: browser Core rung/pacing behavior, Firefox or the separately documented first-loop-row toggle direction. No full sweep or paid qualification.
- Changed: publishable Core package version raised from 0.7.0 to 0.8.0 for the new P6 API/behavior; no registry operation.
- Validation: `pnpm.cmd --filter fluxiq check` after the version bump -> exit 0 (28,212 ms).


### 2026-10-30 - Claude live provider and five-dollar allowance integrated (t816)
- Agent: Codex lead
- Changed: native provider, encrypted-key/session/model routing, keys/settings UI and provider-aware Lab defaults; full evidence in `claude-live-provider-plan.md` and its paired downstream document.
- Validation: lead owning checks -> Core native33, legacy196 and UI33 passed; downstream live150, non-live241, contracts11 and launcher7 passed; affected types/builds/audits passed; Core merge gate ->70 passed.
- Validation: paired task finish and `git push origin dev` -> both merged and pushed; Core a89f69a4, downstream05a70666. No paid calls, panel management or full sweep.
- Not verified: paid/browser Claude quality or comparison; main awaits a qualifying full sweep. Remote task backups retained.


### 2026-10-30 - P5b evidence-specific judge rechecks verified (t810)
- Agent: Codex lead; worker resume_t813, report in paired downstream `reports/codex-1030/t810-result.md`.
- Changed: every no Core overrides must have received its row-evidence re-prompt; new unrefuted defects and missing/failed/unusable rechecks remain nonpassing. Optional checked-cell schema is shared by Claude and DeepSeek; replay rows preserve screened marks and provenance.
- Validation: lead `pnpm.cmd --filter fluxiq exec vitest run` over required recheck agreement/route, native Claude, shared schema and prompt pins -> `8 files, 119 passed`; owning domain left-out/replay-mark tests -> `8 passed`.
- Validation: lead `pnpm.cmd --filter fluxiq check` -> content-matched reuse, exit0; final structure -> `failures: [], 473 warnings, 1144 baselined`. Worker owning RV1467, callers805, domain541 and extension501 passed; affected types, reference/freshness and model-text passed.
- Not verified: new live judge responses. Strict original-artifact replay remains unsure when mandatory replies were never recorded; repeating a saved no is only a scripted acceptance-path test. Provider calls0/cost0. No full sweep or panel management.
- Validation: paired task finish -> downstream structure passed and Core contract gate70 passed; merged Core31713e1d and downstream ad01bd0b.

### 2026-10-30 - P1b and consistent live invocation context accepted (t811)
- Agent: Codex lead; worker resume_t811, report in paired downstream reports/codex-1030/t811-result.md.
- Changed: folded submit/test, labelled repair, Core completion and backend proposal-aware keys; downstream CLI context now reaches planning and actual child model/purse/mode with provider secrets removed.
- Validation: lead helper/gate Vitest ->42 passed; compiled CLI/auth/topology `node --test` ->26 passed; post-parent Core/runner/extension types passed; worker narrowed233 and observer1 passed.
- Validation: headed Chromium two-spec command ->2 passed(4.1m); lead JSON gate ->accepted:true,24rows/2whole/1partial,12-to9 decisions,6supervisor/2Core-completions each; JSON retained in downstream ignored test-runs/2026-10-30-t811-final.
- Outcome: Coreb4a8f453/downstream01da7fa3 merged with Core0.13.0; Core merge contracts70 and downstream structure passed; remote task backups retained.
- Not verified: paid Claude performance, native Firefox or full sweep. No paid calls or panel management.

### 2026-10-30 - Grounded toggle choice and native replay accepted (t817)
- Agent: Codex lead; worker Core/domain/native reports in paired downstream reports/codex-1030/first-row-toggle-*-result.md.
- Changed: actual beforeSignature/CC9 shown survives wire/storage/reload; explicit bounded observed ensureState replaces click-order/majority inference. Safe setters, unknown exploration and admitted undo retained.
- Validation: lead owning Vitest ->199/14files; shared-brief caller ->5/5; domain37 and extension9 pass. Core/domain/extension types,3libs,recursive caller build,docs/model-text/audits pass; no baseline/allowlist exceptions.
- Validation: native first-row saved replay ->15-to15callbacks,3skips,0transitions,3ordered official-oracle records and1saved explicit state; lead JSON assertions accepted. Obstruction-only native ->1passed(1.9m),4recoveries,6UIchecks,exact6controlled uncertainty rows,0failed action/recovery cards and finalyes.
- Outcome: Coreae354e9d/downstreamdf58a48e merged with Core0.14.0;70 Core contracts and downstream structure pass;3JSONs retained in downstream ignored test-runs/2026-10-30-t817-final.
- Not verified: paid Claude behavior/performance, native Firefox or full sweep. No paid calls, panel operation, fixture/oracle changes or registry publish.

