# Report: ext-dev-failures

## Outcome

Done. All ten failing tests are resolved. None was a product regression: all ten are tests that deliberate commits left behind, and the tenth was also reading this machine's real configuration. The guarded behaviour (nothing sent to a wrong or tied frame, a seeded capture reporting unknown coverage) was already correct and every such assertion is kept. No product behaviour or spending authority changed. One operator message and one test-only fence changed in source.

## What changed and why

| Group | Failing tests | Cause | Commit | Fix | Changed |
| --- | ---: | --- | --- | --- | --- |
| Failure-code table | 8 (`action-results` 1, `browser-tab` 1, `action-runner` 4, `frame-address` 2) | t837 made `web.target.not_found`, `not_shown` and `ambiguous` state `effect: "unacted"`, and made `ambiguous` retryable. The change was deliberate: `domain/src/runtime/failure/codes.ts`, its contract test `codes.test.ts` and `docs/architecture/failure-taxonomy.md` all carry it, with the reason "a tie is still refused on each attempt; retryability never authorizes choosing one candidate". t837 touched no test under `apps/extension/src/runtime/tests`, so these went stale. | `e3ff9789` (t837) | Expected records updated to the table's row. Every `sent == []`, `pinged == []`, message and `parseAutomationStudioFailureRecord` round-trip assertion kept. The round trip now also proves Core accepts the new record. `effect: "unacted"` is true on all eight paths, because each refuses before any send. | Test |
| Coverage marker | 1 (`recording-evidence-pipeline`, byte-identical event) | t829 made every all-frame merge add `evidence.frameCoverage`, documented in `docs/architecture/page-evidence.md`. It updated the two sibling tests (`dom-snapshot`, `page-evidence-capture`) and missed this one. The field diff shows that marker is the only difference: `{mode:"all_frames",enumeration:"unavailable",frameIds:[0],capturedFrameIds:[0]}`. I checked its reach by grep: besides the producer in `dom-snapshot.ts`, the only non-test code naming it is `domain/src/page-evidence/types.ts` and `runtime-repeat/capture.ts`, and no state path or model packet carries it. | `ee502b5e` (t829) | Stronger than before: the test asserts the exact marker (a seeded capture must report `unavailable`, as the doc says), then still compares every other byte of the wire event. | Test |
| Ceiling test | 1 (`a chat build passes at whatever ceiling...`) | Two causes. (a) Machine dependence: `tests/lab-ceiling.ts` resolved its ceiling from `process.env`, `process.argv` and the checkout's `.env.local`, and `cost-ceiling-env.ts` was the one env-file reader outside the fence `0715f4c5` built. Measured on the unchanged code: 0 failures at $0.10, 1 at $5 (`.env.local` here), 10 at $8. (b) Stale claim: `24025a64` (t816) lowered `DEFAULT_LLM_LAB_BUDGET.maxEstimatedCostUsd` from $10 to $5 for the five-dollar default, so an unset flag no longer plans whatever ceiling Core has. | `24025a64` (t816), `3d3020a6` (helper reading env), `0715f4c5` (fence gap) | `LAB_CEILING_USD` is now Core's test default and reads no file or env. `labCostCeilingValue` now calls `assertTestMayReadEnvFile`, so a test cannot read a checkout's file again; new test covers it. The test is split into the two facts the code now holds, using the same wording as `ed155444` on the t843 branch (see below). The refusal's advice was wrong, and is fixed: it said "Leave --llm-max-cost-usd out" to someone who had not typed it. It now names the two changes that work, and a new test proves both admit the build. Stale comments in `budget.ts`, `max-cost-within-ceiling.ts` and `live-llm-plan.test.ts` corrected. | Test and source (message text and test fence only) |

`tests/authoring-mode-env.test.ts` also pointed at the real package directory as its "checkout". The new fence would refuse that from any directory holding an env file, so it now names a directory that does not exist.

## Commands run and observed results

1. From `apps/extension`, `EXTENSION_TEST_BUILD_LABEL=ext-dev-failures node scripts/test-extension.mjs runtime/ background/`:
   - Before: `# tests 1413`, `# pass 1404`, `# fail 9`.
   - After: `# tests 1413`, `# pass 1413`, `# fail 0`, exit 0.
   - The label only keeps my bundles out of the default directory; selection is the brief's command.
2. From `packages/test-runner`, `pnpm.cmd build` -> exit 0. Then `node --test "dist/live-llm/tests/*.test.js"`:
   - Before: `# tests 150`, `# pass 149`, `# fail 1`, with `.env.local` in effect ($5).
   - After, variable unset (`.env.local` no longer read): `# tests 153`, `# pass 153`, `# fail 0`, exit 0.
   - After, `FLUXIQ_LLM_RUN_COST_CEILING_USD` at 0.10, 5 and 8: `# pass 153`, `# fail 0` each, so the result no longer depends on the machine.
3. `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> exit 0.
4. `node scripts/structure-audit.mjs` -> `structure-audit: passed (231 warning(s), 553 baselined).` No new findings. The two warnings naming my files are the existing 400-line advisories on `live-llm-run.ts` (737 lines) and `live-llm-run.test.ts` (792 lines), which my test made longer.
5. Neighbours the fence can reach, from `packages/test-runner`: `environment`, `coordinator-existing`, `coordinator-persistent`, `cli-llm`, `target-config`, `test-read-guard`, `dry-run-wiring` -> `# tests 63`, `# pass 63`, `# fail 0`.

## Not verified

- No live or browser run, as the brief requires. The frame and tab refusals are proven against stubs only.
- The rest of the test-runner package and the extension suite outside `runtime/` and `background/`. A test elsewhere in test-runner that reaches `labCostCeilingValue` with a real checkout root and no ceiling in its environment would now be refused by the fence, but only in a checkout that has an env file. I found none by grep and the seven files above pass. The next full sweep is the check that settles it.
- `apps/extension/src/content` tests, which cover the resolver's use of the same table. I changed nothing there.

## Open questions or contradictions found

- **A decision for the user, not made by the user.** A ceiling configured above $5, with no flag, is refused for chat builds and holds direct builds to $5. "A higher Core ceiling never raises the Lab's declared allowance" is an agent's reading (`ed155444`, t843), not something the user said. The user's rule is "$5 per build by default, explicit lower limits hold". I kept the code as it is because changing it raises what a paid run may spend, and the route still exists: type `--llm-max-cost-usd <ceiling>`. It affects only ceilings from $5 to Core's $10 maximum, and `.env.local` here is at $5, so current runs are unchanged. If the user wants a configured ceiling to apply by itself, it is a small change in `beginLiveLlmRun`, which already reads the run's arguments.
- **t843 overlaps this work.** `ed155444` on `task/t843-runtime-foundations` (pushed, not in `dev` or this branch) makes the same test edits in six of these files, and I matched its wording so a merge resolves cleanly. Its report is `docs/working/runtime-ownership-refactor/reports/extension-sweep.md`. It did not isolate `lab-ceiling.ts` or close the fence, and my extra test sits next to its hunk, so a small conflict there is possible.
- **Documentation.** `docs/architecture/testing-facility.md` is accurate on typed amounts but says nothing about an unset flag above $5. It is outside this brief's owned paths.
