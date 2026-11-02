# Snapshot trusted callback completion configuration

Outcome: Done. Owned factory/tests are frozen; all worker processes ended and the lead received explicit final guard completion. Only the five released configuration leaves, their two immediate test subjects, this report and ignored validation tooling/logs changed.

## Implementation and authority

- Added `runtime/execution-observation/configuration/{registrar,configuration,policy,capture,index}.ts`. The three exact interfaces remain manage-only registrar, synchronous configuration and apply-only policy. Existing `ManagedExecutionCallbackRegistration` is the sole declaration/evidence type authority; the generic capture implementation adds no `any` or casts.
- Capture invokes the original configuration method with its original receiver immediately. Its frozen registrar exposes only `manage`; it receives no Source, observer, admission, baseline, native or model capabilities. Every declaration snapshots original receiver, callback, optional binding, contract and original completion reader. The reader is bound to the original registration object, preserving private receiver state through later mutations.
- Each registration and forwarding action is frozen; the completed action list and returned policy are frozen. Later changes to source arrays, methods or declaration fields do not alter the snapshot. Retained registrar calls after either success or failure throw `configuration_closed` instead of silently appending declarations.
- `policy.apply` forwards snapshots to the supplied manage-only target. It can configure separate callback/automation registries. Existing Source matching, duplicate/used-identity rejection and completion semantics remain authoritative; the policy does not manufacture proof or override a registry refusal.
- Non-void configure returns, including fulfilled/rejected promises, synchronously refuse capture with `configuration_must_be_synchronous`. No policy is returned, even for declarations made before an await. The returned promise's rejection is observed and retained as the reported refusal's cause through a getter; this remains safe if the caller freezes that Error. Late async declarations reject against the closed registrar. Synchronous configuration and target-registrar errors propagate.
- No Source/A1/native algorithms or implementation arguments changed. The lead separately owns parent exports, Service constructor/host binding snapshots and before-registration/before-reservation cohort application. Current public barrel and Service constructor were included as read-only strict consumers.

## Focused evidence

New `capture.test.ts` has 12 cases: original private configure receiver; immediate invocation/frozen manage-only surface; callback/receiver/binding/contract/array mutation; exact pair and counterfeit same-name function; late retained registrar; partial failure; separate registries and duplicate Source authority; target failure; rejected/fulfilled/late async declarations with retained causes; non-void refusal; unchanged unsupported default with an empty policy.

New `receipt.test.ts` has 4 actual Source integration cases. The original fixture writer changes its private owned state and issues a private WeakMap receipt only on its actual committed path, keyed by its original returned `Promise<void>`. The pinned original private reader authenticates that exact promise. Copied, rejected and unwitnessed returns stay unverified/pending; an undefined public return or write count/status is never used as completion authority. The original argument tuple gains no observer fields. Mutating the original declaration's reader/identity/tag/array after capture cannot redirect the captured contract.

The first 27-case run passed. The first strict probe then found TS2454 only in the new writer fixture's async-IIFE self-reference. Changed that fixture to assign its original promise before a `Promise.resolve().then` commit callback executes; the private receipt and all assertions remain intact. No production factory change followed the first passing run.

## Exact final validation

From the Core repository root:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/runtime/execution-observation/configuration/tests/capture.test.ts src/runtime/execution-observation/configuration/tests/receipt.test.ts src/runtime/execution-observation/tests/source.test.ts src/runtime/execution-observation/tests/async-receipt.test.ts --maxWorkers 2 --minWorkers 1
```

Observed exit 0: 4 files / 27 tests passed, 2.34s (capture12 + private receipts4 + unchanged Source9 + unchanged original-promise receipts2). Log `.fluxiq/refactor/callback-completion-configuration-final.log`; earlier first pass in `callback-completion-configuration-first.log`.

- `node --max-old-space-size=4096 .fluxiq/refactor/callback-completion-configuration-types.cjs` -> exit 0, strict source-closed NodeNext: 9 owned/public-constructor consumer roots, full 4,604-module source closure, 0 errors, 0 own built-output edges. Emits no outputs.
- `node .fluxiq/refactor/callback-completion-configuration-structure.mjs` -> exit 0, 7 owned files, 0 failures, 0 warnings, 0 unchanged-baseline findings. Includes repository scoped rules, one authority per leaf, barrels, whitespace/EOF/BOM. No baseline/config writes.

Not verified: lead independent acceptance, actual Service/host/cohort policy execution, package builds/checks, full suites, downstream/browser/provider behavior. The public constructor integration was typechecked, not claimed as runtime integration evidence. No user data, git, providers, browser, panel, shared-document edits, whole suites or builds were used by this worker. Source/tests/report are frozen; no further guards or changes planned.
