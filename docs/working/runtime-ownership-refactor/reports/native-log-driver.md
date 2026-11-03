# Native log IO visibility, Stage 1

Status: Stage1 independently ACCEPTED by Root; source/tests FROZEN and all worker/lead readers ended. Implements ONLY [native-log-driver.md](../briefs/native-log-driver.md). Lifecycle, provider/default composition and Source receipt integration are not implemented or released by this unit.

The existing native writer, folder numbering and index algorithms now share one body between legacy and explicit internal calls. The original public writer/open/list signatures, synchronous start/return behavior, void values, screening/redaction, fallback and cache behavior remain. No driver or observation is captured in a long-lived writer.

## Actual implementation

- `native/{functions,invocation,index}.ts`: one per-operation `NativeExchangeLogInvocation`, with private native ACK/failure facts. Original fs/time identities are pinned before awaits; descriptor checks do not invoke accessors. Copied/proxied/subclass objects cannot read/perform through the original private-field reader. There is no Source, observation, receipt, durable registry or async completion authority here.
- `NativeExchangeLogInvocation.state` distinguishes unused, actual native disabled branch, acknowledged native work, failure and unsupported identity. State is evidence about this native driver, never whole callback completion. Original errors are retained privately for the owning caller's cleanup, not rendered into diagnostics. A later successful native operation does not erase an earlier error.
- The observed directory reader accepts only the original platform environment identity; foreign objects/getters/proxies are refused without reading their properties. The old public directory function and custom env semantics are untouched. A disabled driver cannot subsequently execute native IO and retain a disabled claim.
- `writer/native.ts`: `NativeExchangeLogWriter` owns only the existing folder/redacted state and legacy writer object. Its internal text/json/meta methods receive the CURRENT driver on each invocation; shared private methods prevent virtual nested overrides. Errors are retained before best-effort catches; actual compact serialization fallback bytes remain unchanged. Meta serialization still throws the same original error where the old method did.
- `folder/operation.ts`: actual original exclusive mkdir/readdir/numbering loop, with ONE `lastGiven` map. `folder/open.ts` delegates the legacy call. Native errors, including actual retry errors, remain visible to the driver while the original loop/error behavior remains.
- `listing/operation.ts`: actual original rows read/cache/format/write/rename/direct-fallback body, with ONE `rowsByDirectory`. `listing/write.ts` delegates the public void call. Skipped corrupt/read failures, rename/fallback failures and formatting errors remain visible even if later writes succeed.
- No Studio lifecycle, provider/model/secret/SQL/performance, Source/Bindings/Policies/receipts, package/public parent, baseline or shared document changed. No generic callback was declared pure/managed. Root owns any public exports for the new internal entries.

## Compatibility regression caught and corrected

The first native selection passed18/20. One new writer expectation incorrectly expected an indented serialization marker; original code writes the compact marker, so only that NEW literal changed. The other failure was a REAL migration error: I transcribed six separator cells into the non-agent index header while the saved task-entry source has five. The first new oracle correctly detected it.

An initial interpretation that six was historical was wrong. The isolated actual original/current byte comparison independently failed on index.md, and Root verified five against both original checkpoints. Production and new test were restored to FIVE; no original oracle changed. The file otherwise reached successful native temp/rename/index output, so this was an exact presentation-byte regression, not missing IO or observation failure.

The initial strict probe found five new row fixtures missing original required `tool`/`costUsd`; those now explicitly retain undefined. The initial scoped probe found seven packed boundaries in new test traps/getters; those were expanded. No production type, data contract, baseline or exception was weakened.

## Validation and evidence

- Ignored original capture: `.fluxiq/refactor/native-log-driver-originals.json` (actual task-entry helper source, no historical runtime overlay). Owned/closed manifest: `.fluxiq/refactor/native-log-driver-owned.json` (9 production +4 new test files).
- Discovery: new tests close over5/9/8/10 value modules; original screen/native-owner subjects29/41. All have0 mutable native SQL/performance/secret imports,0 unresolved and0 nonliteral imports. Owned full/type discovery53 source modules,0 models/nativeSQL/performance edges. Old scope/agent1599-module subjects were not repeated.
- Root's initial six-file selection:20 cases,18 passed/2 failed as diagnosed above; declaration diagnostics0 and forbidden edges0. Initial strict/scoped failures are recorded above, not presented as clean acceptance.
- Worker command `node .fluxiq/refactor/native-log-driver-parity.cjs` -> exit0:10/10 original algorithm bodies match after removing ONLY explicit native instrumentation;4 original cache/constant initializers identical;12 actual original/current native byte/API/order cases,0 differences. The printer uses each original SourceFile, so string/template/regex literals participate in equality. `.fluxiq/refactor/native-log-driver-ast-parity.json` records the pairs.
- The actual byte probe executes captured-original and current helper bodies in isolated ignored comparison modules against genuine native temporary paths, removes all paths, and never alters package imports/runtime artifacts. It proves writer request/reply/redaction/meta/compact fallback, folder order/numbering and exact index rows/agent bytes. It supplements the ordinary tests; it is not a build/cache or package-test bypass.
- Root final affected writer/listing8/8 passed in1.41s; with the12 unchanged previously passing cases, all20 are accepted. Commands: from `packages/fluxiq`, `pnpm.cmd exec vitest run src/framework/observability/exchange-log/writer/tests/native.test.ts src/framework/observability/exchange-log/listing/tests/operation.test.ts --minWorkers 1 --maxWorkers 2`; from Core root, `node .fluxiq/refactor/native-log-driver-types.cjs` ->15roots/23source modules/0diagnostics, declarations0/foreign0; `node .fluxiq/refactor/native-log-driver-scoped.mjs` ->13files/0failures/0warnings. No duplicate worker run.
- Root also independently reran `node .fluxiq/refactor/native-log-driver-parity.cjs`:10/10 bodies,4 cache/constant initializers and12 native cases,0differences. All lead readers ended before the final freeze handoff.

## Remaining Stage 2

The real default logger still needs its own per-call internal lifecycle/observation bridge, authentic canonical OriginalPromise completion and actual current price/presentation callback coverage. `acknowledged` here does not prove those callbacks, model/native transport, provider body drain or any Source completion. Public best-effort undefined/void is still not an attestation. Nothing in this unit enables observed live providers by itself.

Outcome: Done (Stage 1 independently accepted)
Changed: 9 owned production files and4 immediate test files; this own report
Validation: lead all20focused cases accepted; strict15roots/23sources0,decl0/foreign0,scoped13files0fail/warn; independent parity10bodies/4cache-constants/12native cases0differences
Not verified: normal built/package integration, Stage2/default logger completion, live providers/browser/full suites
Report: docs/working/runtime-ownership-refactor/reports/native-log-driver.md
Notes: SOURCE/TESTS FROZEN; no worker process. No git/shared docs/baseline changes; uncommitted work waits lead integration.
