# Browser field readers (paired task t851)

Worker report. The lead committed round one. Round two sits uncommitted in the two t851 worktrees, on the tree the lead merged with Core `dev` (t850).

## Outcome

Done, in two rounds. Seven Core modules now reach their browser knowledge through hooks on the implementation bundle, and the audit fails any new reader anywhere in Core's non-test source. The web answers are unchanged: comparing the code from before t851 against the new code, over about 233,000 generated comparisons, found no difference. Where a hook is absent, the safety readers fail closed.

**What stayed in Core, by decision:** `locator-text.ts` as a safety screen (lead's decision), and `runtime/target-matching/` as t842's. **One hit needs a real design rather than this method:** `summaries/host-target-resolution.ts`, named below with why.

**The answer to the lead's question, can one run read another's reader: no, after a fix.** Review found one real leak in round one's design: a run for a domain with no reader, started from inside another run, inherited that run's reader. Entering now always replaces, and a test holds it. See "Can one run read another's reader".

## Design notes, one per reader

Five hooks join the implementation bundle (`nodes/importer-sdk.ts`): `recordedStepReader`, `stateElementKindReader`, `activityControlReader`, `controlWordsReader`, `controlParameterKeys`. They are held per domain beside t847's and reached the same way, `nativeNodeRuntime.getTargetHooks(domainId)`, and a second different hook for a domain is refused. Web values live in `domain/src` and are module constants, so registering the bundle twice stays legal. Reader 5 takes no hook.

### 1. `service/instruction-led/recording-steps.ts`: moved, with a generic safety rule kept

**Moved to `domain/src/recording/recorded-step-reader.ts`:** where a recorded control lives (`parameters.element`, a stored fingerprint, a domain event's `element`), `implicitRole`, `attributes.type === "password"`, which fields identify a control, label choice including `visibleText`, and the event-word tables (passive, entering, undoing, which held words like `scroll` and `tab_state`).

**Kept in Core, named plainly as a generic safety rule:** the `SENSITIVE` word screen. It is a rule over words (`pass(word)`, `token`, `cvv`, `iban`, ...) and names no browser concept, so moving it would only let a domain forget it. Core applies it to the `identity` words every reading must supply, so the domain cannot skip it. `cleanLabel` (drops addresses, emails, long numbers) also stays and runs on every label. The domain adds only what it alone can know: `secret: true` for a password-typed field.

**Fail closed.** No reader, a domain with none, or a recording naming no domain: every step is withheld and counted, `steps: []`. Passive events count as withheld too, since Core can no longer tell them apart; that is more withheld than today, never less. A reader that throws propagates and the build's context step fails, so nothing is sent.

**Identical bytes.** The screen joins `identity` with a space exactly as before, so a word split across two fields still matches. Core normalizes `kind` and hands it to the reader. The original test cases moved to `domain/src/recording/tests/recorded-step-reader.test.ts` with their assertions unchanged and run through Core's real `supportingRecordingSteps`.

### 2. `runtime/automation-activity/wording/action.ts`: moved, passed by scope

**Moved to `domain/src/output-nodes/activity-control.ts`:** reading `parameters.element`, its `label`, `accessibleName`, `visibleText`, and `role`, `inputType`. The reading returns `names` in preference order and `kinds`. Core still picks the first name a person can read, with the same 60-character bound and human-label test, so a generated class name falls through to the next name exactly as before.

**Kept in Core:** `BOX_ROLES` and `CHOICE_ROLES`. These are plain widget words, which the audit rule already treats as neutral ("input devices and widget kinds, not the web"), and `words.role` from a page view is read by the same sets.

**How it is passed.** The places that say these sentences know no domain, and two go through the presentation proxy's `unknown[]` arguments. So the service reads the hook from `getTargetHooks` at the run and build entries and enters it into the async scope of that unit of work (`runtime/domain-readings`), which `controlWordsReader` shares. Round one's `wording/control-reader.ts` held its own storage; it now only asks the shared scope.

**No hook.** Not a safety rule: a card says its verb alone ("Clicking on the page"), which shows less. A check step reads as a box.

### 3. `service/evidence/state-elements.ts`: the web's words moved, Core's stayed

**Moved to `domain/src/recording/state-element-kind.ts`:** `selector`, `testid`, `test_id`. Core asks the domain first. Those were already the first words checked, so the order every path is read in is unchanged.

**Kept in Core:** `id`, `label`, `text`, `status`, `route`, `url`, `visible`, `enabled`, `count`, the type-based fallbacks, and `href`. The audit header lists `href` and `url` as Core's addressing words. Moving `href` would also change results: `label.href` reads as `label` today and would read as `url` if a domain were asked first.

**Kept and allowed in the audit:** the literal `"selector"` at the priority line. It is a member of Core's published `StateElementKind`, which domains declare in `elementKind`. This file only ranks it; it never decides a path is one. Renaming the enum is a contract change outside this brief.

**No hook.** Not a safety rule, and nothing weakens: a kind only ranks a path. `sensitive`, `comparable: false` and the unknown, position and bounds exclusions are unaffected. A selector path becomes `text`, which is still correlated, with a slightly lower rank and the same confidence (0.58).

### 4. `runtime/llm/node-tools/rerun-check.ts`: moved

**Moved to `domain/src/output-nodes/control-parameter-keys.ts`:** the three keys. The bundle hook is a `ReadonlySet`, the loop input gains `controlParameterKeys`, and the service passes it on the two loop inputs that build from the bound domain.

**Fail closed.** The rule keeps a done lasting act on the control it ran on, so with no keys every parameter is read as naming the control. Repeating what the step ran with still takes; any new value is refused as another control. That refuses more than today and never moves an act.

**Where a loop can reach it.** Two loops keep a draft and can rerun a done act: the service's legacy build round (`service.ts`, line 1607) and a recovery's exploration (`runtime-exploration.ts`, whose `draft` defaults to on). Both now get the keys. I first missed the exploration and caught it while writing this note; a passing test run had not shown it, because no test reruns a done act there. It now takes the keys through the recovery ports, and `runtime-exploration-control-keys.test.ts` reruns a done act through the real loop both ways. The candidate, subflow, reset and supervisor loops all set `draft: false`, so they cannot rerun; the candidate build's `loop` carries the keys anyway because it is built on the same line.

### 5. `runtime/llm/screening/locator-text.ts`: kept in Core as a generic safety rule, not moved

This is the case the brief asked to have named plainly. **The rule is generic; its data is not fully neutral, and it cannot be made so under the constraints.**

- The rule (no model is handed an address string) is Core's. It holds for every domain and is enforced at the provider pre-flight.
- The patterns still spell web tokens in regular-expression text: `data-`, `aria-`, `class`, `testid`, `/html`, `text()`, `nth-child` and the other pseudo-classes. **I did not remove these and could not.** A purely neutral pattern (any `word-word=`, any `::word`) screens more text, which changes model-facing bytes in the web product. Dropping them screens less, which the brief forbids.
- A hook cannot fix that. The screen is used by 26 source modules with no domain in hand, 14 of them under `runtime/result-verification/**`, which I may not touch, and a provider pre-flight that must apply it regardless. Reaching them would need the shared registry the brief rules out, and a no-hook Core would still have to carry these tokens to fail closed.

**What changed:** comments only, reworded to speak of notations rather than CSS and XPath, and the test moved from `harness/tests/` to `screening/tests/` beside its subject. A diff filter over non-comment lines prints nothing, so the patterns and the code are byte-identical.

**The lead's decision (round two):** it stays in Core as a safety screen that must not weaken. Core still recognises these tokens as data, so "Core knows no browser concepts" holds everywhere except named exceptions like this one. The audit now reads regular expressions too, so this file is a named exception with its reason rather than an unseen one.

### 6. `runtime/llm/model-facing/control-words.ts` and `site-reset/explored-on-absorbed.ts`: moved through one hook

Both read the same list from the same places, so one hook serves them: `controlWordsReader`, in `domain/src/output-nodes/control-words.ts`. It returns the raw strings in preference order (`accessibleName`, `visibleText`, `label`, `placeholder` from `element`, then a fingerprint, then a flat `target` with `name`). **Core keeps the screen:** collapsing and `automationStudioModelFacingControlText` still run on every word, in Core, so model-facing bytes pass through the same filter.

**A third reader of the same shape, found by the search:** `candidate-trial/step-control.ts` read `parameters.element.readsWords`. It became the reading's `readsItsWords`.

**How it is passed.** Seven direct callers, deep and domain-less, including `result-verification/narrowed-before.ts`. They ask the async scope. Its entries are the run and the build (as for the activity hook), both trial runners, for an offline trial outside any build (`ports.domainReadings`, set by the service's trial environment), and the public rebuild seam (`automationStudioProjectSingleSubflowRebuild`, input `domainReadings`, which `packages/test-runner` now passes).

**Fail closed differs by caller, because "no words" is not always the safe side:**

- What a model is told: no name for a control. That shows less.
- `executor/compatibility/classifier.ts` decides from these words whether a legacy step does a lasting act, and there no words used to mean "not lasting", the unsafe side. With no reading it now reads a step with a structured parameter as lasting, rather than risk repeating it.
- `explored-on-absorbed` says "no step does this act". With no reading that cannot be measured, so the finding is not said.

**The cost, stated plainly.** An entry that forgets to enter the readings gets the closed side silently, not an error. For the model-facing words that is a control named by nothing. I audited the entries by hand: `generateFlowBootstrapAdaptation`, `runRuntimeSession`, the two trial runners and the rebuild seam cover the submission controllers, the trial feedback, the recovery context and the result summary. `runAutomationStudioCompiledPlan` and `flow-change/trial.ts` call the executor directly: inside a run they inherit, and outside one they take the classifier's closed side.

### 7. Other hits of the search

- **`runtime/flow-authoring/bootstrap/candidate/authoring-loop.ts`:** `testId` here is a test tool's id, nothing of a page's. Renamed `testToolId`.
- **Needs a real design, not moved: `service/summaries/host-target-resolution.ts`.** It holds a closed allow-list of the strategies the web host reports (`selector`, `coordinates`, `fingerprint`, ...) and admits only those into a run record. It reads no control. A hook would have to reach `runtimeSessionToFlowRunDetail`, a pure conversion that also runs when a stored run is read back, with no domain or scope in hand, so the same method would silently drop the measurement on every read. Named as an exception with that reason.
- **Kept as safety screens, deny-only:** `recovery/context.ts`'s forbidden keys, `model-facing/control-text.ts`'s finding-only words, and the secret-name screens in `harness/throw-screen.ts`, `native-node-runtime.ts`, `reusable-llm-context-store.ts`, `conversations/instructions/{invocation,respond}.ts`, and `activity/text/human-label.ts`'s generated-class screen.
- **Judgement, for you to overrule:** `engine/automation/target-reacquire/lineage.ts` (`TARGET_PARAMETERS`: `element`, `target`), `live-patch/failed-action.ts` and `authoring/matching.ts`'s synonyms **were not moved.** They name parameters and read no field inside them, and `element` and `target` are the audit's own recorded Core nouns. `rerun-check`'s set moved because it held `selector`. Moving them is the same method if you want it.

## The audit

`web-vocabulary` could not catch these readers: `accessibleName` and `visibleText` were not terms, a key list's strings were data, and regular expressions were never read.

**Round two extends it to all of Core's non-test source** (every path under `domainNeutralPaths`), and removes the five-file list. Browser field names and notations now count as names, as whole strings and inside regular expressions. `selector` and `password` count only as a whole name or string, so `isWeakPassword` and `freshEvidenceSelector` stay legal.

**`domainReadingExceptions` in `scripts/structure-audit/config.mjs`** names every remainder with its terms and reason, among them `locator-text.ts` and `runtime/target-matching/`. An exception that holds none of its terms any more, or names no file, fails, so the list can only shrink. `.structure-baseline.json` is unchanged in both repositories, so no baseline rose. The rule is mirrored to the extension, whose config audits no neutral path, so it stays inert there.

**`placeholder` is deliberately not a term.** Core's parameter UI and SQL own the word in about twenty files. A new reader of only that field would pass; every other field beside it would not.

## Can one run read another's reader

**Round one's answer was yes, in one case, and I changed the approach.** `reader ? storage.run(reader, fn) : fn()` meant a domain with no reader, run from inside another's scope, kept the outer reader. Now entering always replaces, and the service passes `{}` for a domain with none.

`framework/automation-service/tests/domain-hooks/tests/activity-control-hook.test.ts` proves it through the real service, in the way t850 proved two runs apart:

- Two services with different readers, whose presses wait until both are in flight, so the runs truly overlap on one event loop. Each card and each dispatch reads its own.
- A run with a reader beside a run with none: no leak.
- A run with its own reader, and one with none, each started from inside a third's scope: each reads its own or none, and the outer scope is intact after.

`runtime/domain-readings/tests/scope.test.ts` holds the same at the scope's level, including across awaits. **Another domain's reader:** one service binds one domain (`ioRuntime.domainId`), and the hook is looked up by that id, so it reads no other.

**What I did not prove:** a long-lived worker created inside one run and later serving another would carry the first's scope. I found none that says these sentences or words, by reading, not by test.

## Other files changed outside the first brief's list

**Public surface** (`framework/automation-service/index.ts`): `supportingRecordingSteps`, `inferStateElementKind`, `automationStudioModelFacingControlWords`, `automationStudioTrialStepControl`, `automationStudioClassifyLegacyStepAct` and `runtime/domain-readings`. A domain test or host seam has no other way in.

**Core source:** `runtime/domain-readings/` (new); `runtime/llm/loop-configuration.ts`, `evidence-loop.ts` (one inline argument, still at the 800 limit); `service.ts` (inline, still 4304 lines); `runtime/automation-activity/{scope,run,build,index}.ts`, `wording/{index,control-reader}.ts`; `gateway-trace/wiring/{run,build}-activity.ts`; `service/evidence/{correlations,mining}.ts`; `service/instruction-led/recordings.ts`; `runtime/native-nodes/native-node-runtime.ts`; `runtime/adaptation/recovery/runtime-exploration.ts`, `annotation/{ports,annotate,exploration}.ts`; `service/candidate-trial/{contracts,run,step-control}.ts`, `subflow-trial/run.ts`, `trial-ports/environment.ts`; `executor/compatibility/classifier.ts`; `runtime/project-agents/single-subflow/rebuild.ts`.

**Core tests:** a `vi.mock` of the reader in tests that assert a control's words, with `wording/tests/example-control.ts` and `domain-readings/tests/example-readings.ts`. **This includes two files under `runtime/result-verification/`** (`tests/narrowed-before.test.ts`, `refuted-no/tests/narrowing-step-claim.test.ts`), which my first brief listed as must-not-touch; they failed without it, and no source there changed. New: `service/evidence/tests/state-elements.test.ts`, `wording/tests/control-reader.test.ts`, `domain-readings/tests/scope.test.ts`, `tests/domain-hooks/tests/{activity-control-hook,domain-hooks-through-a-build}.test.ts`, `recovery/tests/runtime-exploration-control-keys.test.ts`.

**Extension:** `packages/test-runner/src/offline-trial-experiment/rebuild/rebuild-candidate.ts` (passes the readings); `domain/src/runtime/llm-evidence/evidence-summary/tests/page-text.test.ts` (see open questions).

**Docs:** `docs/architecture/runtime-ownership.md` (each hook, who supplies it, what happens with none, how it reaches its reader, what Core still spells), `automation-studio-native-nodes.md`, `code-structure.md`, `package-boundaries.md`; the extension's `docs/architecture/repository-layout.md`.

## Commands run and observed results

All of these ran on the merged tree (Core `dev` with t850), after the last edit and a rebuild of Core's libraries.

| Command | Observed |
| --- | --- |
| `vitest run --minWorkers 1 --maxWorkers 2` over the folders beside the readers: `instruction-led/tests`, `wording/tests`, `evidence/tests`, `node-tools/tests`, `screening/tests`, `model-facing/tests`, `site-reset/tests`, `domain-readings/tests`, `candidate-trial/tests` | `Test Files 107 passed (107)`, `Tests 1463 passed (1463)` |
| same, over the service-level hook tests, the exploration rerun, and every file the wide run failed on | `Test Files 13 passed (13)`, `Tests 138 passed (138)` |
| `node --test scripts/structure-audit/rules/tests/web-vocabulary.test.mjs` | `# tests 24`, `# pass 24`, `# fail 0` |
| `pnpm.cmd --filter fluxiq check` | exit 0 |
| `node scripts/structure-audit.mjs` (Core) | `structure-audit: passed (482 warning(s), 1098 baselined).` |
| `pnpm.cmd --filter @fluxiq-web-extension/domain check` | exit 0, `core-build: ... is current with its source.` |
| `DOMAIN_TEST_BUILD_LABEL=t851 node scripts/test-domain.mjs recording/tests output-nodes/tests evidence-summary target-preparation` | `# tests 189`, `# pass 189`, `# fail 0` |
| `pnpm.cmd --filter @fluxiq-web-extension/extension check` | exit 0 |
| `pnpm.cmd --filter @fluxiq-web-extension/test-runner check` | exit 0 |
| `node --test dist/offline-trial-experiment/rebuild/tests/rebuild-candidate.test.js` (test-runner) | `# tests 4`, `# pass 4`, `# fail 0` |
| `node scripts/structure-audit.mjs` (Extension) | `structure-audit: passed (233 warning(s), 553 baselined).` |
| `node scripts/check/core-mirror.mjs` | `core-mirror: 1 mirror set(s) match FluxIQ Core at ...: structure-audit (74 files).` |

**The wide run.** Before the last test fixes I ran 1,127 test files, in every directory these readers reach, at two workers, in about 70 minutes: `Test Files 9 failed | 1117 passed | 1 skipped`, `Tests 25 failed | 10156 passed | 2 skipped`. All 25 were Core tests asserting a control's words with no reading in scope, or one fake runtime with no `getTargetHooks`. No non-test source changed after that run, by a file-time check, and those nine files are in the second row above. It was one run, not repeated after the test fixes, and it is not Core's whole suite.

### The behaviour comparison

The domain tests port the original cases with the same assertions, through Core's real functions. Because a wrong answer here would be costly and hard to see, I also ran the code from before t851 (`0b702db9e`) against the working tree with the real domain readers, over generated inputs. It is a throwaway script, not committed. Output on the final tree:

```text
recording steps: 20000 timelines, 9277 steps, 19843 withheld, 199 undone, 0 differences
recording steps with no reader: 5000 timelines, 0 that showed a step or withheld fewer than today
state kinds: 40000 paths, 0 differences
activity sentences: 40000 inputs, 77 distinct sentences, 0 differences
checked reruns: 8000 calls, 1169 took, 0 differences
control words, trial control, legacy acts, explored findings: 30000 inputs each, 0 differences
control words with no reader: 5000 inputs, 0 that named a control, read a lasting act as not lasting, or said a finding
DIFFERENTIAL: no differences
```

Reader 5 needed no comparison because its code did not change: `git diff` of `locator-text.ts`, filtered to non-comment lines, prints nothing.

### The field-name search

The audit now is that search, over all of Core's non-test source, and passes. Over the original five, a plain text search for the brief's field names finds two lines, both justified: `state-elements.ts:81` (the enum member) and `locator-text.ts:71` (the screen). Across Core, `accessibleName` and `visibleText` remain only in `runtime/target-matching/` and the passive types in `flows/authoring/model/action-element-target.ts`. Words that remain and are Core's own: `label` (a node's authored label and the step's output field), `target` (the domain's `words.target`) and the widget-word sets.

### Baselines

`.structure-baseline.json` is unchanged in both repositories.

## Not verified

- **Any live or browser behaviour.** No browser, Lab or provider ran, as the brief required. Everything is Node, with a scripted model.
- **The two-run proof at the whole-package level.** The wide run below was not the whole Core suite: it covered 1,127 files in the directories these readers reach, not `pnpm test`.
- **A reader that throws.** By reading the code it propagates; no test holds this.
- **A long-lived worker shared across runs.** See "Can one run read another's reader".
- **The domain's and test-runner's full test suites**, per the twice-a-day cap. Only the folders named above ran. `pnpm docs:reference --check` was not run; the new exports add to a listing that was already stale.

Round one's not-verified items are now covered. `pnpm.cmd --filter @fluxiq-web-extension/extension check` ran. A scripted-model service test proves the control keys, the recorded-step reader and the readings reach a real build (`domain-hooks-through-a-build.test.ts`), including a checked rerun that takes with keys and refuses without. A rerun of a done act through a real exploration loop is tested (`runtime-exploration-control-keys.test.ts`), though the exploration is driven directly, not through a whole recovery.

## Open questions or contradictions found

- **The t850 merge left a downstream test red.** `domain/src/runtime/llm-evidence/evidence-summary/tests/page-text.test.ts` relied on the process-wide page reader t850 removed. It failed on the merged tree (`a registered web bundle is what gives Core's step log its page.txt`). I passed `runtime.stepLogPageText` in the test. Extension `dev` has the old version, so anyone building that test against Core's `dev` sees the same failure until this merges.
- **Whether to move `lineage.ts`, `failed-action.ts` and `matching.ts`** (note 7). Not moved; yours to overrule.
- **`host-target-resolution.ts`** needs a design if the goal must hold literally (note 7).
- **`packages/fluxiq/docs/reference/framework-reference.md`** was already stale and gains these exports.
