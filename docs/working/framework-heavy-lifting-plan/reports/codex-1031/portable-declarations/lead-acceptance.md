# Public declaration portability acceptance

Status: Accepted and merged on paired dev, 2026-10-31. No provider request has been made.

The supervised Claude continuation reached the actual isolated Lab's test-runner build and stopped with four TS2307 errors. Emitted SDK `batch-member.d.ts` and `execution-authority/create.d.ts` refer to `packages/contracts/dist/core.js`, which is not a portable import for a downstream consumer. Earlier Core/domain/extension/test-evidence prelude builds passed; no browser/model run or billed verdict occurred. The same defect exists in main and pinned SDK output. This is not machine load or an API failure.

The accepted t833 source/behavior tests remain evidence for that change. They did not cover this strict SDK consumer. Its actual build failure is the acceptance oracle for this repair; no downstream path alias, skipLibCheck, generated-file edit, model fallback, guard override or paid retry is permitted as a workaround.

Paired isolated task t834 owns the fix; Core source patch version is 0.25.1. The worker applied explicit existing owned return signatures at the two inference sites and a declaration-build import guard with focused emitted/consumer tests. Root verified the actual generated declarations now retain their owned type references instead of expanding workspace paths. Both October31 full-suite slots are used; no full suite was run.

Observed lead acceptance:

- `node --test scripts/tests/rewrite-declaration-imports.test.mjs` ->8/8 passed,30032.8012ms. Real TypeScript emit reproduces the bad alias; a strict external consumer gets TS2307 before the contract annotation and passes after, while an invalid JSON-to-number assignment still fails. Worker final8/8 passed15.610s; three runtime owning files7/7 passed74.26s.
- Both changed runtime source files independently transpile byte-identically to their original committed versions (ES2022/ESNext, no source maps). Evidence `runtime-emit-parity.log` records both SHA256 values. No runtime/public structural behavior change is inferred merely from compilation.
- Fresh SDK `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket build` passed with the new guard: contracts26.573s, SDK101.744s, client8.813s. The actual downstream Core freshness gate passed.
- `pnpm.cmd --filter fluxiq check` ->PASS73.024s; plain `node scripts/structure-audit.mjs` ->Core1143/Down583 baselined, no new allowance. Scoped working-doc index updates are not claimed as full audits.
- Actual failed consumer: after ordered contract/domain/evidence dependencies (Domain26.236s), `pnpm.cmd --filter @fluxiq-web-extension/test-runner build` ->PASS33.914s, no downstream alias or skipLibCheck. Evidence `actual-consumer-build.log` preserves the exact command/output. This closes the original four-TS2307 failure, rather than relying only on the stand-alone regression.
- Labelled actual public Core/web/Gate candidates plus unchanged original section/completion pins ->9/9 passed312.1521ms. No main actions/provider calls. The declaration guard proves path resolution, not every imported symbol's semantics; strict consumer tests provide the associated typing check.

Expected unchanged behavior: public runtime/API semantics, target intent, permissions, effects and rerun execution. New behavior: a future nonportable emitted module reference fails during SDK construction instead of reaching Lab startup. Relative .ts-to-.js rewriting and valid Node/external/self imports must continue working.

After accepting and integrating the repair, repin the reserved `fxlab/t833-claude` pair, rerun the provider-free preflight and normal live waste guards, then supervise one Claude company-website engineer extraction with the already requested $5 whole-build allowance and one zero-call replay. Slot1 remains owned by that continuation. The positive headless Chromium fixture proof already passed with all eight records; neither that result nor the dry run is a Claude performance result.

Integration observed: both task branches backed up, parent merges were already current, and the post-parent actual consumer build reused its matching successful stamp. Down's own plain-audit finish merged7e2b3688 and removed its private tree. Core's mandatory70contract merge tests passed14.31s; its own finish mergede5674831. Private Core is clean detachedee5cae97 for age-prune; remote backups retained. Shared SDK refresh, paired dev publication and the pinned Lab repin are underway. Full suites and main promotion remain held; no provider call is being attributed to this compile repair.

Baseline evidence: main Down ignored `test-runs/2026-10-31-t833-validation/claude-preflight.log` and final-state.json. Current setup/acceptance evidence belongs under ignored `test-runs/2026-10-31-t834-validation/` in the private paired Down tree; copy it to main before task finish removes that worktree.
