# Browser field readers (paired task t851)

Worker report. Nothing is committed. All changes sit in the two t851 worktrees.

## Outcome

Done, with one reader deliberately not moved. Four of the five readers now reach their browser knowledge through hooks on the implementation bundle, and the web answers are unchanged: a comparison of the old code against the new over about 113,000 generated inputs found no difference. Where a hook is absent, the two safety readers fail closed.

**Reader 5, the locator screen, stays in Core and still spells CSS and XPath tokens in its regular expressions.** It is the one case where the goal and the safety rules cannot both be met; the note below says why. If "Core knows no browser concepts" must hold literally, that file is the remaining exception and needs a decision.

## Design notes, one per reader

Four hooks join the implementation bundle (`nodes/importer-sdk.ts`): `recordedStepReader`, `stateElementKindReader`, `activityControlReader`, `controlParameterKeys`. They are held per domain beside t847's and reached the same way, `nativeNodeRuntime.getTargetHooks(domainId)`, and a second different hook for a domain is refused. Web values live in `domain/src` and are module constants, so registering the bundle twice stays legal. Reader 5 takes no hook.

### 1. `service/instruction-led/recording-steps.ts`: moved, with a generic safety rule kept

**Moved to `domain/src/recording/recorded-step-reader.ts`:** where a recorded control lives (`parameters.element`, a stored fingerprint, a domain event's `element`), `implicitRole`, `attributes.type === "password"`, which fields identify a control, label choice including `visibleText`, and the event-word tables (passive, entering, undoing, which held words like `scroll` and `tab_state`).

**Kept in Core, named plainly as a generic safety rule:** the `SENSITIVE` word screen. It is a rule over words (`pass(word)`, `token`, `cvv`, `iban`, ...) and names no browser concept, so moving it would only let a domain forget it. Core applies it to the `identity` words every reading must supply, so the domain cannot skip it. `cleanLabel` (drops addresses, emails, long numbers) also stays and runs on every label. The domain adds only what it alone can know: `secret: true` for a password-typed field.

**Fail closed.** No reader, a domain with none, or a recording naming no domain: every step is withheld and counted, `steps: []`. Passive events count as withheld too, since Core can no longer tell them apart; that is more withheld than today, never less. A reader that throws propagates and the build's context step fails, so nothing is sent.

**Identical bytes.** The screen joins `identity` with a space exactly as before, so a word split across two fields still matches. Core normalizes `kind` and hands it to the reader. The original test cases moved to `domain/src/recording/tests/recorded-step-reader.test.ts` with their assertions unchanged and run through Core's real `supportingRecordingSteps`.

### 2. `runtime/automation-activity/wording/action.ts`: moved, passed by scope

**Moved to `domain/src/output-nodes/activity-control.ts`:** reading `parameters.element`, its `label`, `accessibleName`, `visibleText`, and `role`, `inputType`. The reading returns `names` in preference order and `kinds`. Core still picks the first name a person can read, with the same 60-character bound and human-label test, so a generated class name falls through to the next name exactly as before.

**Kept in Core:** `BOX_ROLES` and `CHOICE_ROLES`. These are plain widget words, which the audit rule already treats as neutral ("input devices and widget kinds, not the web"), and `words.role` from a page view is read by the same sets.

**How it is passed, and the one judgement call to review.** The six places that say these sentences (`graph-run`, `failed-attempt`, `announcement`, `edit-words`, `tool-call`, `started`/`recovering`) know no domain, and two go through the presentation proxy's `unknown[]` arguments. Threading a parameter would have meant rewriting each path. So the service reads the hook from `getTargetHooks` at the run and build entries and enters it into the async scope of that unit of work (`wording/control-reader.ts`), the pattern `runtime/activity/presentation/scope.ts` already uses for this same stream. This is not a registry: nothing registers, nothing outlives the work, and concurrent runs cannot see each other's reader (a test holds this). It is still one step further from "passed as a parameter" than the other hooks.

**No hook.** Not a safety rule: a card says its verb alone ("Clicking on the page"), which shows less. A check step reads as a box.

### 3. `service/evidence/state-elements.ts`: the web's words moved, Core's stayed

**Moved to `domain/src/recording/state-element-kind.ts`:** `selector`, `testid`, `test_id`. Core asks the domain first. Those were already the first words checked, so the order every path is read in is unchanged.

**Kept in Core:** `id`, `label`, `text`, `status`, `route`, `url`, `visible`, `enabled`, `count`, the type-based fallbacks, and `href`. The audit header lists `href` and `url` as Core's addressing words. Moving `href` would also change results: `label.href` reads as `label` today and would read as `url` if a domain were asked first.

**Kept and allowed in the audit:** the literal `"selector"` at the priority line. It is a member of Core's published `StateElementKind`, which domains declare in `elementKind`. This file only ranks it; it never decides a path is one. Renaming the enum is a contract change outside this brief.

**No hook.** Not a safety rule, and nothing weakens: a kind only ranks a path. `sensitive`, `comparable: false` and the unknown, position and bounds exclusions are unaffected. A selector path becomes `text`, which is still correlated, with a slightly lower rank and the same confidence (0.58).

### 4. `runtime/llm/node-tools/rerun-check.ts`: moved

**Moved to `domain/src/output-nodes/control-parameter-keys.ts`:** the three keys. The bundle hook is a `ReadonlySet`, the loop input gains `controlParameterKeys`, and the service passes it on the two loop inputs that build from the bound domain.

**Fail closed.** The rule keeps a done lasting act on the control it ran on, so with no keys every parameter is read as naming the control. Repeating what the step ran with still takes; any new value is refused as another control. That refuses more than today and never moves an act.

**Where a loop can reach it.** Two loops keep a draft and can rerun a done act: the service's legacy build round (`service.ts`, line 1607) and a recovery's exploration (`runtime-exploration.ts`, whose `draft` defaults to on). Both now get the keys. I first missed the exploration and caught it while writing this note; a passing test run had not shown it, because no test reruns a done act there. It now takes the keys through the recovery ports, with a test that the loop receives them. The candidate, subflow, reset and supervisor loops all set `draft: false`, so they cannot rerun; the candidate build's `loop` carries the keys anyway because it is built on the same line.

### 5. `runtime/llm/screening/locator-text.ts`: kept in Core as a generic safety rule, not moved

This is the case the brief asked to have named plainly. **The rule is generic; its data is not fully neutral, and it cannot be made so under the constraints.**

- The rule (no model is handed an address string) is Core's. It holds for every domain and is enforced at the provider pre-flight.
- The patterns still spell web tokens in regular-expression text: `data-`, `aria-`, `class`, `testid`, `/html`, `text()`, `nth-child` and the other pseudo-classes. **I did not remove these and could not.** A purely neutral pattern (any `word-word=`, any `::word`) screens more text, which changes model-facing bytes in the web product. Dropping them screens less, which the brief forbids.
- A hook cannot fix that. The screen is used by 26 source modules with no domain in hand, 14 of them under `runtime/result-verification/**`, which I may not touch, and a provider pre-flight that must apply it regardless. Reaching them would need the shared registry the brief rules out, and a no-hook Core would still have to carry these tokens to fail closed.

**What changed:** comments only, reworded to speak of notations rather than CSS and XPath, and the test moved from `harness/tests/` to `screening/tests/` beside its subject. A diff filter over non-comment lines prints nothing, so the patterns and the code are byte-identical.

**The honest limit.** Core still recognises these tokens as data, so "Core knows no browser concepts" is not literally true of this file. The audit's own stance is that a regular expression is data; the lead or the user may want to weigh that.

## The audit

`web-vocabulary` already covered these paths and none had a baseline entry, but it could not catch these readers: `accessibleName` and `visibleText` are not terms, and a key list's strings are data. So it would have passed before this work too.

New config `domainReadingFreePaths` lists the five files. For them the rule also counts browser field names (`implicit role`, `accessible name`, `visible text`, `input type`, `test id`, `testid`, `autocomplete`, `password`, `selector`, `xpath`, `css`), as names and as whole strings. Regular expressions and sentences stay data. An entry may `allow` a term (only `state-elements.ts`, for `selector`). A listed path naming no audited file fails. The rule is mirrored to the extension; its config there lists nothing, so it stays inert.

## Other files changed outside the five

Named because the brief's list was by purpose: `framework/automation-service/index.ts` (two public exports, `supportingRecordingSteps` and `inferStateElementKind`, because a domain test cannot load past the package's exports); `runtime/llm/loop-configuration.ts`, `runtime/llm/evidence-loop.ts` (one inline argument, line count unchanged at the 800 limit); `service.ts` (inline edits, line count unchanged at 4304); `runtime/automation-activity/{scope,run,build,index}.ts`, `wording/index.ts`, `wording/control-reader.ts`; `gateway-trace/wiring/{run,build}-activity.ts`; `service/evidence/{correlations,mining}.ts`; `service/instruction-led/recordings.ts`; `runtime/native-nodes/native-node-runtime.ts`; `runtime/adaptation/recovery/runtime-exploration.ts` and `annotation/{ports,annotate,exploration}.ts` (the exploration's keys). Tests: a one-line `vi.mock` of the reader in ten files that assert a control's name, with `wording/tests/example-control.ts`; `authority.test.ts`, `rerun-request.test.ts`, `native-node-runtime.test.ts`; new `service/evidence/tests/state-elements.test.ts`, `wording/tests/control-reader.test.ts`, `tests/activity-control-hook.test.ts` (real service, real run), `recovery/tests/runtime-exploration-control-keys.test.ts`.

## Commands run and observed results

All of these ran on the final tree, after the last source edit and a rebuild of Core's libraries.

| Command | Observed |
| --- | --- |
| `vitest run --minWorkers 1 --maxWorkers 2` over `instruction-led/tests`, `wording/tests`, `evidence/tests`, `node-tools/tests`, `screening/tests` | `Test Files 49 passed (49)`, `Tests 574 passed (574)` |
| same, over `runtime/automation-activity`, `step-count-activity`, `step-counter`, `activity-control-hook`, `native-node-runtime`, `llm/evidence-loop`, `recovery/tests`, `state-routing`, `task-proposals` | `Test Files 124 passed (124)`, `Tests 1278 passed (1278)` |
| `node --test scripts/structure-audit/rules/tests/web-vocabulary.test.mjs` | `# tests 22`, `# pass 22`, `# fail 0` |
| `pnpm.cmd --filter fluxiq check` | exit 0 |
| `node scripts/structure-audit.mjs` (Core) | `structure-audit: passed (482 warning(s), 1098 baselined).` |
| `node scripts/build-cache/cli.mjs fluxiq:build ui-components:build` (Core) | exit 0, both stored |
| `pnpm.cmd --filter @fluxiq-web-extension/domain check` | exit 0, `core-build: ... is current with its source.` |
| `DOMAIN_TEST_BUILD_LABEL=t851 node scripts/test-domain.mjs recording/tests output-nodes/tests` | `# tests 157`, `# pass 157`, `# fail 0` |
| `node scripts/structure-audit.mjs` (Extension) | `structure-audit: passed (233 warning(s), 553 baselined).` |
| `node scripts/check/core-mirror.mjs` | `core-mirror: 1 mirror set(s) match FluxIQ Core at ...: structure-audit (74 files).` |

### The behaviour comparison

The brief asks for tests proving Core plus the real domain gives today's answer. Those are `recorded-step-reader.test.ts`, `state-element-kind.test.ts`, `activity-control.test.ts` and `control-parameter-keys.test.ts` in the domain. Because a wrong answer here would be costly and hard to see, I also ran the code at `HEAD` against the working tree with the real domain readers, over generated inputs. It is a throwaway script, not committed. Output on the final tree:

```text
recording steps: 20000 timelines, 9277 steps, 19843 withheld, 199 undone, 0 differences
recording steps with no reader: 5000 timelines, 0 that showed a step or withheld fewer than today
state kinds: 40000 paths, 0 differences
activity sentences: 40000 inputs, 77 distinct sentences, 0 differences
checked reruns: 8000 calls, 1169 took, 0 differences
DIFFERENTIAL: no differences
```

Reader 5 had no such comparison because its code did not change: `git diff` of `locator-text.ts`, filtered to non-comment lines, prints nothing.

### The field-name search

A search of the five for `implicitRole`, `attributes.`, `autocomplete`, `password`, `accessibleName`, `visibleText`, `testid`, `test_id`, `TARGET_KEYS`, `selector`, `CSS`, `XPath`, `.element` and `inputType` finds two lines:

```text
evidence/state-elements.ts:81:  if (descriptor.kind === "static_id" || descriptor.kind === "selector") score += 18;
screening/locator-text.ts:71:   /\b(?:id|name|class|testid)\s*=\s*(?:"[^"]*"|'[^']*'|[#.\w-]+)/u,
```

Both are justified above, under readers 3 and 5. `locator-text.ts` also keeps other tokens the search does not name (`data-`, `aria-`, `/html`, `nth-child` and more). Words that remain and are Core's own: `label` (a node's authored label and the step's output field), `target` (the domain's `words.target`) and the widget-word sets.

### Baselines

`.structure-baseline.json` is unchanged in both repositories. No entry needed lowering: none of the five had a `web-vocabulary` entry, and the audit passes on the rest.

## Not verified

- **Any live or browser behaviour.** No browser, Lab or provider ran, as the brief required. A step card naming a real control, and a real recording's account reaching a model, were exercised only in Node.
- **Two service call sites run no test.** The recorded-step reader at `service.ts` line 1518 and the control keys at lines 1578 and 1608 need a model-driven build to execute. They are one-line reads of the hook, checked by the type checker, and what they feed is tested. `activity-control-hook.test.ts` does run the real service end to end, for the activity hook only. The mining constructor's reader is covered at `createStateActionCorrelations`, not through `AutomationStudioEvidenceMining`.
- **A rerun through the exploration.** The test proves the loop receives the keys, not a full rerun of a done act there.
- **A reader that throws.** By reading the code it propagates and fails the step; no test holds this.
- **The whole suites**, per the twice-a-day cap: Core's vitest, `pnpm test`, `pnpm check`, `pnpm build`.
- **`pnpm --filter @fluxiq-web-extension/extension check` and its build.** Not in the brief's list. The new domain modules import only types from Core, so I expect no change to the browser bundles, but I did not check them.
- **`pnpm docs:reference --check`.** Not run. The new public exports add to a listing that was already stale.

## Open questions or contradictions found

- **Other Core files still read these fields.** A search outside the five finds `accessibleName`, `visibleText`, `implicitRole` or `inputType` in `runtime/llm/model-facing/control-words.ts` and `runtime/flow-authoring/bootstrap/site-reset/explored-on-absorbed.ts`, neither on my list. They also appear in `runtime/target-matching/**` and `flows/authoring/model/action-element-target.ts`, which earlier tasks kept as Core's neutral types. `control-words.ts` is model-facing, so moving it needs the same care. "Core knows no browser concepts" is not finished until these are decided.
- **`replaced-choices.ts`** reads role words (`link`, `option`, `menuitem`, `button`, `combobox`, `tab`) on `step.role`. Same class as `BOX_ROLES`: neutral widget words, and it reads no browser field. Not owned, left alone.
- **Documentation.** `docs/architecture/` in both repositories does not describe these hooks; it was outside my owned paths and AGENTS.md asks for it in the same unit. `packages/fluxiq/docs/reference/framework-reference.md` was already stale and gains these exports.
- **Public surface.** `supportingRecordingSteps` and `inferStateElementKind` became public through `fluxiq/automation`, in `framework/automation-service/index.ts`, a file outside my owned list. A domain test has no other way to call Core's real answer. Please review that this is acceptable.
- **The brief's "Owned" list and the exploration.** `runtime/adaptation/recovery/**` was not named, but it is a caller that must pass the hook, so I took it as covered.
