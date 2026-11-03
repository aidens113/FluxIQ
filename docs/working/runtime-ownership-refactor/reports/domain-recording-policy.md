# Trusted domain recording policy

Dispatch: [domain-recording-policy](../briefs/domain-recording-policy.md). Heavy Sol Max; paired t843 only. SOURCE + TESTS FROZEN. No active worker reader remains.

The existing instance-owned native target registry now exposes `policy(domainId)` and `requiresRecordingPolicy(domainId)`. It stages the registered requirement, complete four-method original policy binding and both existing target hooks before SDK mutation, then commits only after SDK accepts. Exact original receiver/functions and unchanged requirements are idempotent; conflicts and malformed fourth methods leave every existing map untouched. A required domain without implementation retains its deny-only registered requirement. No second scope store, copied context, matcher fallback or automatic pure/managed policy declaration was added.

Optional bundle target hooks/policy and the manifest requirement use original own data descriptors. Every policy method is pinned through the same check; own/inherited accessors refuse without invoking getters. Consumers receive frozen bindings with original policy receiver and original functions, preserving their receiver/tuple/error semantics across later replacement.

Down's actual bundle installs `webRecordingTargetPolicy`; its real manifest always declares the policy requirement, while an explicitly absent implementation remains absent. The complete old Studio outer target guard moved to Down and composes the already moved original inner guard/validator. Legacy scalar selector, geometry, visual target, metadata, warning/error codes/messages/paths and command encoding remain unchanged. Ingress null-target refusal and standalone null-target no-issues behavior remain distinct. The command metadata is the exact original input object.

Recording projection/parameter helpers moved intact into cohesive `domain/src/target-normalization/recording/{entry,parameters,policy,target,index}.ts`; public target-normalization exports stay compatible. Root's Core/downstream IO bridge test files, SDK/public contracts, scope/capture/ingress/Service integration and final Core validator removal were not edited. Native secret, SQL/performance and C trial sources remain untouched.

Exact ownership/selector manifest: `.fluxiq/refactor/domain-recording-policy-owned.json` (Core six source/two tests; Down seven source/two tests; two relocation removals). The following completed on frozen source:

- From `packages/fluxiq`: `pnpm.cmd exec vitest run src/runtime/native-execution/target-preparation/tests/policy.test.ts` -> 21/21 passed, exit 0, 0.97 s.
- From Core root: `node .fluxiq/refactor/domain-recording-policy-local.cjs` -> four actual public-source Down subjects, 16/16 passed; 29 inputs each, no active backend edges. Covers new policy plus all existing target validation, recording projection and normalization subjects.
- `node .fluxiq/refactor/domain-recording-policy-parity.cjs` -> 166 exact JSON/error comparisons with captured ORIGINAL outer guard, standalone policy wrapper, command encoder and complete original element validator; zero differences. It is an independent original/current comparison, not a second production implementation.
- `node .fluxiq/refactor/domain-recording-policy-browser.cjs` -> actual browser policy entry, 20 inputs, zero forbidden/external/Node dependencies, 19,514 bytes; no polyfills or package overlays.

These are source-local checks using actual public Core source resolution. No normal Core build currency or guarded downstream integration is claimed. Prepared `domain-recording-policy-types.cjs` and `domain-recording-policy-scoped.mjs` are held for the coordinated common freeze. The scoped script keeps the FULL repository context/graph, runs official rules, then filters emitted findings by owned files/directories; destination barrels are never hidden.

Checkpoint fixture follow-up: Root's common feature run found three new registration cases stopped at SemVer validation because both fixture helpers declared `packageVersion: "1"`. Only those two values in `runtime/native-execution/tests/recording-policy.test.ts` changed to matching valid `"1.0.0"`. All five test bodies/assertions, deliberate `sdkVersion: "foreign"`, atomic maps/requirement checks, zero-getter and no-pure contracts remain unchanged. `pnpm.cmd exec vitest run src/runtime/native-execution/tests/recording-policy.test.ts` from `packages/fluxiq` -> 5/5 passed, exit 0, 5.20s. Duplicate registration now reaches and asserts the actual `already registered` refusal. Reader ended; source/tests frozen again.

Still held by this worker: existing target-preparation/normalizer subjects, Down native-runtime bundle/manifest consumer, strict types/scoped audits and normal built integration. Root owns authenticated/stored scope selection, locked raw validation, generic ingress and eventual removal of old Core browser validators; those are required before claiming the recording boundary complete.

Outcome: Partial
Changed: Exact owned manifest and this report; no shared docs/config/baseline edits.
Validation: Core21 +Down16 +actual native registration5 passed; original/current166 parity0differences; browser20inputs0Node. Broader checks held by coordination.
Not verified: Down bundle/manifest integration, types/scoped acceptance, current built packages, start/append/restart scope behavior or live browser.
Report: docs/working/runtime-ownership-refactor/reports/domain-recording-policy.md
Notes: SOURCE FROZEN; no active worker readers, providers, git, full suites or native-secret edits.
