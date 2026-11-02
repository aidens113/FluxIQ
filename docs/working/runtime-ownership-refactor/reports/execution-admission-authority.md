# Neutral execution admission authority (A1)

Outcome: Done. A1 SOURCE FROZEN; contracts and mechanism ready for independent acceptance.

Dispatch: [execution-admission-authority brief](../briefs/execution-admission-authority.md). Contract: [API proposal and accepted amendments](execution-admission-api.md).

Owned source: `packages/fluxiq/src/runtime/execution-admission/**`. Outside source, only this report and the lead-authorized accepted-amendments section of `execution-admission-api.md` changed. No parent barrels, manifests, configuration, SQL/Studio/gateway/engine/native/IO/candidate code or git were changed.

## Implemented

- One configured continuation/scope per factory, original private scope/grant/reservation/entry membership, fixed source readers and policy, registration closed at the first reservation attempt.
- Original scope/source/persistence receivers retained. Ordinary proof, origin and evidence identities are consumed synchronously; verified DTOs are copied/frozen before persistence. Caller JSON/status fields grant nothing.
- Sources bind to the original scope and explicitly delegate to original child-owner identities. Cross-source nesting works only inside the original reservation/scope; foreign/copy/prototype handles fail membership.
- Trusted entry bridge checks the original entry and returns row/fence plus original owner/origin and current lifecycle/activity. A2 must re-read the original entry inside its actual claim transaction; the snapshot is not authority.
- All durable mutations forward to the frozen persistence port. There is no in-memory production safety journal or clear fallback. Entry handles are exposed only after their writes complete; failures, abort and release do not manufacture completion.
- Parent finishing locks synchronously against new children; local children must finish first. Persistence derives/CAS-checks its actual durable child frontier; source completion has no caller-selected frontier digest.
- Transactional test fake retains coverage across authority reopen and supports controlled pauses/failures, active resource fences, stable trial series, required handling and derived child frontier. Actual private source proof registries exercise identity rather than trusting fake result shapes.
- Lead's broader audit found two swallowed-failure sites outside the first scoped rule selection. The released follow-up retains actual abort-write errors, tracks the full catch-and-retention promise, waits for it during orderly release, then reports retained causes in `AggregateError` (including any release error). With no background error, release preserves its original failure. Original caller-owned mutation promises/errors remain unchanged. The tracking-only rejection retirement now documents that ownership explicitly.
- The focused `release.ts` finalizer keeps release/error aggregation cohesive and `lifecycle.ts` below its 400-line advisory while using the same original reservation state; no second registry or authority was introduced.

## Validation

`pnpm.cmd --filter fluxiq exec vitest run src/runtime/execution-admission/tests/authority.test.ts src/runtime/execution-admission/tests/lifecycle.test.ts src/runtime/execution-admission/tests/concurrency.test.ts` -> latest final run passed 3 files / 28 tests (1.46s). Covers real original private proof registries, copied/prototype/JSON/cross-owner handles, captured receivers/readers, first/unverified-next behavior, actual persistence ordering, unknown/required and failed delivery observation across reopened/different continuations, consumption before await, fence/parent races, abort, release and mutation failures. New paused/rejected abort-append cases prove release waits, surfaces original cause identities after durable cleanup, combines release failure, leaves coverage open, and permits no further admission. A separate case proves original caller mutation error identity is unchanged.

`node packages/fluxiq/node_modules/typescript/bin/tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --allowImportingTsExtensions --skipLibCheck packages/fluxiq/src/runtime/execution-admission/index.ts packages/fluxiq/src/runtime/execution-admission/tests/authority.test.ts packages/fluxiq/src/runtime/execution-admission/tests/lifecycle.test.ts packages/fluxiq/src/runtime/execution-admission/tests/concurrency.test.ts` -> final exit 0. Source and immediate tests are isolated from the rest of the package graph.

Scoped structure rules initially found two packed callback lines in `tests/lifecycle.test.ts`; both were expanded. The first selection omitted swallowed-failure; the lead's broader audit found the two sites above. After the released cleanup fix, the command below includes that rule over all owned source and reports `A1 scoped structure findings: 0`, exit 0:

```powershell
node --input-type=module -e "import { createContext } from './scripts/structure-audit/context.mjs'; const ctx = createContext(); const prefix = 'packages/fluxiq/src/runtime/execution-admission/'; const owns = path => path.startsWith(prefix); const scoped = { ...ctx, files: ctx.files.filter(owns), sourceFiles: ctx.sourceFiles.filter(owns), scriptFiles: ctx.scriptFiles.filter(owns) }; let count = 0; for (const rule of ['imports','import-cycles','exported-values','as-never','naming','directory-files','file-lines','class-methods','statement-packing','test-placement','web-vocabulary','swallowed-failure']) { const mod = await import('./scripts/structure-audit/rules/' + rule + '.mjs'); const findings = mod.run(scoped).filter(finding => owns(finding.path)); for (const finding of findings) console.log(rule + ': ' + JSON.stringify(finding)); count += findings.length; } console.log('A1 scoped structure findings: ' + count); process.exitCode = count ? 1 : 0;"
```

Entry points for review: `runtime/execution-admission/index.ts`, `authority.ts`, `lifecycle.ts`, `contracts/index.ts`. Declaration groups: scope, entry/bridge, reservation, inspection, source plus consumer/producer/persistence/assembly/evidence. Validation is source-local. The three immediate test files and their private source/scope-owner/transactional-persistence fixtures stay under the feature's `tests/`.

## Integration obligations

A2 owns real UnitOfWork/migrations, durable inventory/fences, exact command linkage, sole gateway observer and required handling. B owns authentic producer/quiescence and canonical semantic witnesses. C owns one-use candidate permit and pinned cached/no-dispatch mode. A1 alone enables no production retry exception and proves no actual external no-second-send behavior.

An abort refuses further live handles immediately. It does not roll back a persistence transaction already entered with a valid completion witness; A2 must preserve actual transactional ordering/fence checks. A failed/aborted invocation without a completion witness remains open. No abort/release path calls finish by itself.

Not verified: SQL/real restart, gateway authentication/claim transaction, native direct-effect quiescence, actual engine/IO/host integration, candidate repeat behavior, package-wide typecheck/build/structure, downstream behavior. No full suites, builds, providers, browser, panel or user-data operations ran.
