# Lead acceptance: t836 actual build allowance

Status: Accepted narrow implementation; paired integration and published-pin production API proof pending. No paid retry.

The first successful Claude-backed product invocation made6calls at recorded cost0.1912105 and reached draft testing/two judges, but failed before accepted Flow/oracle/replay. Its whole run226.262s included production compilation; provider window39.407s, build39.782s. The build ran with a stored0.25 policy despite both CLI flags, child environment and authorized Lab plan5. No provider/model/key/balance error occurred. Provider connectivity is proven; task performance is not.

The pure blank Flow factory supplies ordinary policy0.25. Runtime fresh creation now supplies the test-scoped host default, while ordinary model/UI defaults and existing/lower policies stay intact. The public service had retained duplicate inline blank creation, leaving the extracted owner unused; it now delegates to that owner through the existing facade, preserving caller/generated IDs, lookup order and public saveFlow override. There is no invented canonical authority or new endpoint. Stored per-call limits also used an obsolete0.25 bound although the API accepts up to10; the runtime now uses the same shared server bound and retains min-based narrowing. SDK patch0.25.3.

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/tests/service-flows/tests/creation-budget.test.ts src/programs/automation-studio/runtime/service/flows/tests/creation.test.ts src/programs/automation-studio/runtime/service/flows/tests/validation-context.test.ts src/programs/automation-studio/runtime/llm/flow-execution-limits/tests/resolution-within-flow-settings.test.ts --maxWorkers=1 --minWorkers=1` -> lead4files/32tests passed124.92s. Real isolated dataDir/persistence, actual public creation/session resolver/loop/purses/carried spend, explicit lower policies0.25/0.05, scoped defaults/lower cap, ordinary valid/malformed knob, caller identity/public saveFlow, SQL/file writer and actual API-validator-to-runtime bound cases. Provider/secret functions are not called. Serial worker count scopes real-SQL validation; no timeout increased.

Validation: `pnpm.cmd --filter fluxiq build` -> final fresh stamped SDK passed141.848s; declaration portability guard and isolated native importer pass retained.

Validation: `pnpm.cmd --filter fluxiq check` -> final stamped typecheck passed94.678s.

Worker additional acceptance: final actual public persisted7cases86.38s;4owning files29cases61.55s (includes existing API validator cases); lead independently exercised the acceptance seam in32cases above.

Earlier results are not acceptance: two cold-import/wrong-purse harness runs failed; six component-only cases passed but used cast stubs and an unused owner, and the audit rejected8as-never casts/deep imports/packed statements. The test moved to the existing runtime service-flows test owner to avoid a26th flat runtime test. A rootless public case then failed on file persistence; final authoritative tests use production-like temporary dataDir and real writer/storage, with no storage source change. All are detailed in worker.md. Initial lead10existing/6component cases and134.209s SDK are superseded by the final actual public-service checks; an initial typecheck108.166s explicitly withheld its stamp because inputs changed. No baseline increase or skipped failing test is used.

Validation: final `node scripts/structure-audit.mjs` -> Core passed1143baselined, Down passed583baselined. Owning `--update` ratchet independently inspected: only service.ts file-line allowance4315to4304, no other change/growth; plain audit after update is authoritative.

Remaining: paired integration/publication/repin. Then prove the exact published production API creates policy5, accepts/persists per-call1 and preserves explicit policy0.25 with model providers disabled. Only then may the supervised unchanged eight-record Claude task retry under5 and request one zero-call replay. Both Oct31 full-suite slots already used; main promotion waits a permitted passing sweep. No credentials/page captures/profiles are committed.
