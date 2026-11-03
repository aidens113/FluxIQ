# Web boundary port (paired task t847)

Worker report. Source read through git from `task/t843-runtime-foundations`, base `dev`. Nothing committed; changes sit in the two t847 worktrees.

## Outcome

Done, with the limits named under "Not verified". Target normalization, recording target projection and validation, mapper parameter reading, output target reading and the page-text reading now live in `domain/src`. Core reaches them only through hooks on the existing implementation bundle. The execution admission and observation system was left behind in full. Nothing had to be stopped on: every web piece separated from it.

## What changed and why

### Core (neutral hooks only)

- `packages/fluxiq/src/runtime/output-dispatch/` is new: the action, preparer and preparation contracts, the generic matcher call (`matchOutputTarget`) and confidence floor moved out of `io-policy.ts`, and `prepareOutputAction`. It has a public subpath, `fluxiq/runtime/output-dispatch/preparation`, which the extension's browser bundle reaches, so it is listed in the audit's browser entries and in the program-independent reach boundary. Both of those tighten the audit. `scripts/structure-audit/config.mjs` is the only script changed.
- `nodes/importer-sdk.ts`: the bundle gains `outputTargetPreparer`, `recordingEntryTargetPreparer`, `recordingTargetPolicy`, `recordingCandidateParameterNormalizer` and `llmEvidenceSummary`.
- `runtime/native-node-runtime.ts`: holds the hooks per domain (`getTargetHooks`), refuses a second, different hook for a domain before anything is registered, gives mapper bindings `normalizeParameters`, and registers the evidence summary with the step log.
- `model/action-element-target.ts` now holds passive types only. `isAutomationStudioElementTarget`, `normalizeAutomationStudioElementTarget` and `validateAutomationStudioElementTarget` are gone from Core's public surface.
- Consumers changed to call the hooks: `runtime/io-policy.ts`, `runtime/service/runtime-session/graph-options.ts`, `runtime/service/object-documents.ts`, one line of `runtime/service.ts` (line count unchanged), `runtime/service/recordings/proposal-candidates.ts` and `proposal-generation.ts`, `model/validation/recording.ts` (takes a policy, defaults to structure only) with new `model/validation/recording-target-policy.ts`.
- `step-log/page-text.ts` is now a small named registry (`automationStudioLlmStepLogPageText.of` / `.use`). `tool-step.ts` changed one call and one comment. It still formats and writes `page.txt`.

### Extension

- `domain/src/target-normalization/**` and `domain/src/output-nodes/target-preparation/**`: ported from t843. `native-runtime.ts` registers the hooks. `manifest-definitions.ts` marks element outputs `outputTargetPreparationRequired`.
- `domain/src/runtime/llm-evidence/evidence-summary/`: `webLlmEvidencePageText` (the same breadth-first search, moved unchanged) and `webLlmEvidenceSummary`, with the requested test matrix plus one end-to-end test through a registered bundle and Core's real step log.
- `domain/src/host.ts`: binds the web bundle when no native runtime is bound. See decision 3.
- Test imports swapped to the domain normalizer, same alias as the source commits, in `domain/src/**`, `apps/extension/src/content/**` and `apps/extension/e2e/content/**`.
- `pass-row-own-run.test.ts` and eight truthful-fixture test files from `ed155444` ported. See "Failures that were already on dev".

### Decisions made while porting

1. **Left behind, as required.** `prepare-action.ts` calls the preparer directly instead of through `invokeObservedOutputSync`. Dropped: `ExecutionCallbackPolicies`, `pinDefaultWebElementMatcher`, `pinNativeRecordingTargetPolicy`, the descriptor checks in `prepareRecordingEntryTargets`, the frozen action view, and the receiver bindings. The web behaviour stays and the calls went. Tests that only asserted those guards were rewritten or dropped (`target-preparation/tests/bundle.test.ts`).
2. **Also left behind, because nothing on `dev` calls it.** Dev has no recording ingress decoder, so `accepts`, `commandTarget`, `isWebRecordingTarget`, `recordingTargetPolicyRequired` and `domainRecordingIngress` have no consumer here, and `recording/target.ts` needs t843's decoding module. Porting them would have imported dead code and a large module. The bridge's `String(command.target.type ?? "client-target")` stays in Core: it is a neutral envelope and reads no browser field.
3. **`host.ts` binding, my addition, not in t843.** Web outputs now refuse dispatch without a registered preparer (`output.target_preparer_missing`). `createWebAutomationFluxIQ`, which the domain README tells hosts to use, had no native runtime, so it would have started refusing element actions it used to dispatch. It now binds the bundle when nothing is bound. Please review this one.
4. **The step log's summary registry is process-wide.** A tool step has no domain in hand and `automationStudioLlmStepLogTool` is called from places I may not touch (`progress-trace.ts`, `service.ts`). Threading it through would have meant a wider Core edit, so I took the small process-level set, next to the step log's own process-level switch. It is shared mutable state, which is the cost; a second domain's summary in one process would be asked in registration order.
5. **Core tests.** `model/tests/action-element-target.test.ts` is deleted (its cases are in `target-normalization/tests/legacy-element-target.test.ts`). The opaque target test keeps only what Core does. `io-policy.test.ts` and `io-bridge.test.ts` keep their assertions with a test preparer, `runtime/output-dispatch/tests/example-preparer.ts`. `tool-step.test.ts` keeps its `page.txt` expectations, registers a fake reading in `beforeEach`, and gains a no-summary case. `policy-action-target-repair.test.ts` now asserts Core carries the target unread; its web half moved to `target-preparation/tests/prepare.test.ts`.

## Checking the closure report

`reports/web-boundary-closure.md` said page-text is the last active web interpreter. That is too strong. Its target and recording claims describe t843 and were not true of `dev` until this port. These Core modules still read browser fields; all are under the "must not touch" path, so I left them:

| File under `programs/automation-studio/runtime/` | What it reads |
| --- | --- |
| `service/instruction-led/recording-steps.ts` | `implicitRole`, `attributes.type` password and autocomplete checks, element names, to word and withhold recorded steps |
| `activity/wording/action.ts` | `element.label`, `accessibleName`, `visibleText`, for activity card names |
| `service/evidence/state-elements.ts` | classifies state paths by words such as `selector` and `testid` |
| `llm/node-tools/rerun-check.ts` | `TARGET_KEYS` is `target`, `selector`, `element` |
| `llm/screening/locator-text.ts` | screens CSS and XPath shapes out of text; screening rather than interpretation |

`runtime/target-matching/matcher.ts` scores `visibleText` and `queryPath` by neutral default weights; t842 left that as Core-owned and I did not change it.

## Commands run and observed results

### Core (`fxwork/t847/!FluxIQ`)

| Command | Result |
| --- | --- |
| `pnpm.cmd --filter fluxiq check` | exit 0 |
| `node scripts/structure-audit.mjs` | `structure-audit: passed (487 warning(s), 1106 baselined).` |
| `pnpm.cmd exec vitest run .../step-log/tests src/runtime/output-dispatch/tests` | exit 0, 10 files passed |
| `node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql` on `policy-action-target-repair`, `native-node-runtime`, `step-log/tests`, `instruction-led/tests/service.test.ts` | `all groups passed`: parallel 10 files 89 tests, real-sql 2 files 16 tests |
| same runner on `datasets/intermediate-output`, `summaries/tests`, `in-run-repair/service-proofs`, `refuted-result/repair-replay-chain`, `judged-run-evidence`, `service-recordings/state-index` | `all groups passed`: 124 and 29 tests |
| `vitest run` on `model/tests`, `io-policy`, `opaque-target-execution` (before the last native-runtime test edits) | 21 files, 184 tests passed |
| same runner on `service-recordings`, `io-bridge`, `instruction-led`, `recordings`, `runtime-session`, `client-gateway/tests` | real-sql: 3 failed of 152, then fixed or cleared, see below |

That earlier run had three failures. `policy-action-target-repair` was a real expectation of Core normalization, now changed. Two `instruction-led/tests/service.test.ts` tests hit the 15 s timeout while I was running `tsc` at the same time, and passed in the re-run above. On the final tree, `FLUXIQ_TEST_GROUP=real-sql vitest run` on `service-recordings/proposals`, `service-recordings/storage` and `io-bridge` -> 3 files, 30 tests passed. The rest of that earlier group (`recordings`, `runtime-session`, `client-gateway/tests`) was not repeated after my last edits, which touched only tests and the mapper return type.

### Rebuild and extension (`fxwork/t847/!FluxIQWebExtension`)

| Command | Result |
| --- | --- |
| `node scripts/build-cache/cli.mjs contracts:build fluxiq:build client-gateway-websocket:build` | exit 0 |
| `pnpm.cmd --filter @fluxiq-web-extension/domain check` | exit 0 |
| `DOMAIN_TEST_BUILD_LABEL=t847 node scripts/test-domain.mjs target-normalization target-preparation recording/ evidence-summary` | 144 tests, 144 pass |
| `DOMAIN_TEST_BUILD_LABEL=t847-llm node scripts/test-domain.mjs llm-evidence` | 1591 tests, 1591 pass |
| `DOMAIN_TEST_BUILD_LABEL=t847 node scripts/test-domain.mjs io/tests output-nodes/tests client/tests requests/policy runtime/tests/ tests/domain.test web-panel-host core-gateway-recording-order recorded-identity-shortfall tests/safety opaque-target` | 461 tests, 461 pass |
| `pnpm.cmd --filter @fluxiq-web-extension/extension check` | exit 0 (needs `domain build` first, as `domain/node` reads `dist`) |
| `pnpm.cmd --filter @fluxiq-web-extension/extension build` | exit 0, chrome, firefox and e2e-chromium each `verified 22 files` |
| `node scripts/structure-audit.mjs` | `structure-audit: passed (238 warning(s), 583 baselined).` |

### Leave-behind check

The brief's check 3, run as `git grep --untracked -nE` over its two terms -> no output, exit 1, in both worktrees. This report avoids spelling them so the check stays literal. A wider grep for `ExecutionCallbackPolicies`, `invokeObservedOutput`, `hasFrame`, `getOwnPropertyDescriptors`, `pinNative`, `pinDefaultWebElementMatcher`, `recordingTargetPolicyRequired` and `domainRecordingIngress` over the new and hook files -> no matches.

### Baselines, only ever lowered

Core `.structure-baseline.json`: 2 lowered, 4 removed, via `node scripts/structure-audit.mjs --update`, all from this work. Extension `.structure-baseline.json`: one entry lowered, `packages/test-runner/.../persisted-flow-run.test.ts` 6 -> 4. That file was outside my owned paths and the improvement was already there on `dev`, not from this work. I ran `--update` to see it. I then tried to put the number back by hand and the permission system refused the edit, since that raises an entry, so it remains at 4. It is true and harmless; keep it or drop it as you prefer.

## Failures that were already on `dev`

Measured on the plain `dev` checkout (`d6e5448c`, Core `ff8eb0be8`) with the same test files:

- 20 failures in `refusal-notice`, `replay-other-record`, `replay-ambiguous-target`, `replay-remembered`, `listing-order-in-repeat`, and 5 in `carried-*-service-repair`. Those fixtures sent bare `{ code }` failures or stale pages. Porting `ed155444`'s versions took them to 24/24 and 7/7 on this branch. So those 25 are fixed by this port.
- 8 failures in `apps/extension/src/runtime/tests/{action-results,action-runner,browser-tab,frame-address}`: the same 8 on `dev` and here. That path is outside my brief, so they still fail. `ed155444` has the fixture change (`effect: "unacted"`).
- `packages/fluxiq/docs/reference/framework-reference.md` and its copy were already stale on `dev`: regenerating gave about 1,000 changed lines, nearly all from t842's moves. I restored them, so `pnpm docs:reference --check` fails until someone regenerates. This work also changes the listing (three removed functions, new exports).

## Live browser behaviour

**Exercised, all visible and provider-free:**

- `test-content.mjs -- --headed tests/identity-resolution.spec.ts`: 25 passed, on company-website, bigbox-retail, everything-store, crossborder-marketplace and auction-marketplace. This runs recorded descriptors through the domain's normalizer and the content script's resolver, with no extension loaded.
- `tests/check-chosen-option`: 3 ok on crossborder-marketplace, also with no extension loaded.
- `e2e/action.spec.ts`: 1 passed, the real extension loaded on the everything store, through the content-script message path. It does not pass through Core's dispatch or the new preparer.

**Not exercised:**

- The real path that matters most: a Flow's element action dispatched by Core through `outputTargetPreparer` to the real extension in a browser. Unit and service tests cover it in Node only.
- Two scripted builds through the real extension, `site-reset/tests/photo-toggle.spec.ts` and `photo-dialog-act.spec.ts`, were my attempt at it. Both fail here with `flow_bootstrap.evidence_repeat_without_progress`. `photo-toggle` fails with the same code on plain `dev`, so it is not caused by this work. I did not baseline `photo-dialog-act` on `dev`, and neither spec reached the point that would prove the path.
- Recording from a real browser into Core storage. `recording-entry.test.ts` covers it through the real service in Node only.
- Firefox, the panel, and any paid or live Lab run.

## Not verified

- Whole suites, per the user's cap: Core's vitest, `pnpm test`, `pnpm check`, `pnpm build`.
- `recordingTargetPolicy` has no production caller on `dev`. `validateRecordingSession` was already called only from tests, so registering the policy changes no live behaviour. I did not add a new gate.
- Other extension e2e specs and other `apps/web` consumers of Core; a Core type check covers only `packages/fluxiq`.

## Open questions or contradictions found

- The brief says "active browser semantics" should all move, while the table above lists Core readers under the must-not-touch path. They need a follow-up after the file move.
- `docs/architecture/` in both repositories does not describe the new hooks. Documentation was outside my owned paths and AGENTS.md asks for it in the same unit.
- A host that binds `createWebAutomationDomainIo` directly with no native runtime now gets `output.target_preparer_missing` for element outputs. Found and fixed in two test helpers (`required-context.ts`, `gateway-output-dispatcher-durable-reconcile.test.ts`) and `host.ts`. `gateway-output-dispatcher-definition.test.ts` passes without a change.
