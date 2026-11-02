# Actual execution admission producers

Outcome: Done. SOURCE FROZEN.

Dispatch: [execution-admission-producers brief](../briefs/execution-admission-producers.md). Builds on the accepted [API proposal](execution-admission-api.md), [A1 authority](execution-admission-authority.md), and the root-owned frozen gateway contracts.

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ`. No original/t842 checkout, git action, package-wide suite/build, provider, browser or user data was used. No process remains running.

## Contract and composition

- One configured source cohort is created per original A1 scope before first reserve: shared callbacks, engine, native, output, gateway and the composition's actual root/trial owners. Sources implement the canonical `ConfiguredExecutionSource`; no duplicate owner DTO or ledger.
- Native: `createNativeExecutionAdmissionSource(scope, runtime?, registrations?)`, `bindRuntime(runtime, registrations?)`, `forParent(parent, retrySeries?)`, `flush()`. Register the exact original implementation plus package/definition versions and a truthful no-direct-effects or managed completion contract. Existing effective grants and domain matchers are unchanged.
- Output: `createOutputExecutionAdmissionSource(scope, { gateway?, gatewayTargets? })`, `forParent(parent, origin?, retrySeries?)`, `provenanceReader`, `markGatewayTarget(originalReceiver, originalCallback)`, `manage`, `flush`. `OutputGatewayTarget` is the exact receiver/callback pair, captured by the actual registration owner.
- Engine: `createAutomationExecutionAdmissionSource(scope, { native?, output? })`, `forParent`, `forRun(parent, originalRunProof, originalReader)`, `manage`, `flush`. `createAutomationGraphOptions` accepts the optional `executionObservation`; private companions survive graph, compiled, composite, region timeout and child option copies.
- Delegation is explicit: engine -> engine/native/output; output -> output/gateway; native -> none by default; actual root/trial owner -> engine and its real callback owners. Original authority, scope and reservation never change to get clearance.
- Root owns ordinary exploration root issuance. `forRun` consumes only A2's original persisted-root proof/reader. Required command Context stays the identical original object. No fabricated session/run IDs or owner data from metadata/JSON.
- The actual IO/transport backend is the gateway child's parent. Root's optional `readCompletion(originalContext, exactOriginalParent)` is captured with its original receiver. Pending/absent means no credit; settled is accepted only after A2's genuine durable child closure. Required completion remains deferred until real handling/consume, then the fixed original completion owner rechecks its retained outcome.
- Unsent required withdrawal awaits the existing registered `ClientGatewayCommandOutcome.stop`. A legacy custom commandRun with no Outcome observer retains its old result/trace behavior. No old test expectation was changed.

## Actual execution and retry behavior

Neutral callback observation pins the selected receiver, callback and typed argument tuple before the persistence await, enters a durable child, and invokes that exact method. Registered completion sees both the original fulfilled value and original thrown/rejected object. Arguments, values and errors stay private; durable evidence uses bounded references/digests. Observer write failures remain open and propagate through the original call plus awaited cleanup.

Sync callbacks stay synchronous under an already durable frame. Unsupported calls mark the frame unverified before invocation; original errors/receivers remain intact. Read-only invocation requires the exact registered no-direct-effects receiver/callback/binding and produces no admission, completion credit or history mutation. This is not a blanket read-only/offline Flow port.

The generic callback source has NO function/reservation-wide repetition fence. Repeated unsupported reads remain unverified and can run during a first execution. The backend fence uses a private per-pass invocation identity, associated with the actual engine arrival and retained only for scheduled retries, with a distinct derived token for each emitted effect ordinal. A successful direct same-node self-loop gets a fresh private pass identity without resetting arrival, retry, pace or progress counters. Two authored arrivals using one adapter, or two real effect ordinals, each run once. The same invocation's unsettled backend cannot run again; truthful settled computation can use ordinary retries. Tokens are private, scope-bound, and copied/foreign tokens refuse.

Actual native implementation, IO adapter and runtime transport calls are observed before invocation, including sync throw, lost acknowledgement and abort-ignoring late work. Canonical native bridges pin original methods. Unknown custom native ports receive their original four arguments; unknown capabilities callbacks receive no observer argument. Automatic callback issuers/companion readers live under the private output admission internal barrel, and are absent from the public output surface. A consumed framework request remains observed on reuse, while adapters cannot read its companion through the ordinary reader.

Actual host capture, diff, expectation, route observation, route signatures/effects, fact checks, act-landed checks and runtime-repeat callbacks are observed without host cloning/proxying. Outside-graph retry dispatch enters before the caller callback and before its result reader. A page-only `not_landed`, returned `effect: unacted`, status/success flag or pure fault assessment cannot issue gateway/backend closure. Required unknown and lost-ACK work remain protected. `ExecutionUnactedCompletionReader` has no issuer/fallback in this unit.

Legacy absence keeps ordinary APIs, payloads/results, output identity/confirmation timing, matching floors, host identity and runtime semantics. In observed mode, automatic orchestration contracts apply only to Core-defined original methods. Unknown/custom callbacks retain unverified/pending coverage and earn no safe-retest credit.

## Changed ownership

New cohesive owners: `runtime/execution-observation/**` (excluding root-owned `roots/**` and its parent barrel), `runtime/native-execution/admission/**`, `runtime/output-dispatch/admission/**` (excluding root-owned `gateway/**`), `engine/automation/execution-admission/**`, and immediate tests.

Narrow integration leaves: native-node-runtime; IO registry; runtime/service; output dispatcher/preparation/confirmation forwarding; engine integration/environment/compiled/graph/node/frames/composite/outside-graph/host-state/repeat/transitions/state-routing/lifecycle fact invocation leaves; runtime automation-host route-state invocation leaves. No A1, SQL/command owner, candidate/LLM/trial wrapper, manifests/config, parent public exports or shared working document was edited.

## Validation

All commands below ran from the worktree above. The exact complete focused acceptance command is:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/runtime/execution-observation/tests src/runtime/native-execution/admission/tests src/runtime/native-execution/tests/native-node-runtime.test.ts src/io/tests/index.test.ts src/runtime/tests/service.test.ts src/runtime/output-dispatch/tests src/engine/automation/execution-admission/tests src/engine/automation/outside-graph/tests src/engine/automation/host-state/tests/capture.test.ts src/engine/automation/lifecycle-run/tests/fact-observation.test.ts src/engine/automation/defensive/tests/host-act-landed.test.ts src/engine/automation/tests/node-execution.test.ts src/engine/automation/composite/tests/run.test.ts src/engine/automation/compiled-plan/tests/run.test.ts
```

Observed: this cohort passed 22 files / 192 tests before the final private-surface tightening. The three subsequent containment tests make its current expected total 22 files / 195 tests; that combined 195 run is deliberately left for lead independent acceptance. The affected post-tightening cohort passed 11 files / 76 tests; after correcting two new fixture type declarations, the final affected producer/source-closure rerun passed 2 files / 11 tests. Earlier graph-run file passed all 25 tests.

Final strict source + new tests:

```powershell
node packages/fluxiq/node_modules/typescript/bin/tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM,DOM.Iterable --allowImportingTsExtensions --skipLibCheck packages/fluxiq/src/runtime/execution-observation/tests/source.test.ts packages/fluxiq/src/runtime/execution-observation/tests/backend.test.ts packages/fluxiq/src/runtime/native-execution/admission/tests/native.test.ts packages/fluxiq/src/engine/automation/execution-admission/tests/producers.test.ts packages/fluxiq/src/engine/automation/outside-graph/tests/observed.test.ts packages/fluxiq/src/engine/automation/composite/execution.ts packages/fluxiq/src/runtime/service.ts packages/fluxiq/src/runtime/output-dispatch/index.ts
```

Observed: exit 0. Initial new custom-port fixture errors (missing native `logs`, invalid refresh discriminator) were fixed in the fixture; no contract was widened.

Focused acceptance proves durable-before-call; private original receivers; synchronous and rejected outcomes; native timeout/late work; unknown and forged unacted results; zero second native/IO/transport/outside-graph act; page-only no-clear; four truthful compute-only outside attempts; ordinary output retries; distinct authored invocations/effect ordinals; repeated unverified reads; copied/foreign series refusal; no producer fields/arguments in implementation data; public private-issuer isolation; failed completion write retention; legacy required result/actionability and source closure.

Owned scope audit: the following stdin script was run with `node --input-type=module -` (PowerShell here-string). Observed `{files:122,rules:15,failures:0}` and `{whitespace:0}`. It retains original rule budgets/targets, selects only owned source roots, and uses the complete graph for transitive reach checks. No baseline/config exemption was added.

```javascript

import {createContext} from './scripts/structure-audit/context.mjs';
import {readdirSync} from 'node:fs';
const ctx=createContext();
const prefixes=['packages/fluxiq/src/runtime/execution-observation/','packages/fluxiq/src/runtime/native-execution/admission/','packages/fluxiq/src/runtime/output-dispatch/admission/','packages/fluxiq/src/engine/automation/execution-admission/'];
const exact=new Set([
'io/index.ts','runtime/service.ts','runtime/native-execution/native-node-runtime.ts',
'runtime/output-dispatch/io.ts','runtime/output-dispatch/io-effect.ts','runtime/output-dispatch/runtime-effect.ts','runtime/output-dispatch/prepare-action.ts','runtime/output-dispatch/confirmation/await.ts',
'engine/automation/graph-run.ts','engine/automation/node-execution/execution.ts','engine/automation/node-execution/attempt.ts','engine/automation/node-execution/recorded-effect.ts',
'engine/automation/host-state/capture.ts','engine/automation/frames/graph-frame.ts','engine/automation/integration/input.ts','engine/automation/integration/graph-options.ts',
'engine/automation/environment/executor-options.ts','engine/automation/compiled-plan/run.ts','engine/automation/composite/execution.ts','engine/automation/composite/boundary.ts',
'engine/automation/defensive/host-act-landed.ts','engine/automation/repeat/guard.ts','engine/automation/transitions/comparison.ts','engine/automation/state-routing/decision.ts',
'engine/automation/state-routing/checkpoint-facts.ts','engine/automation/state-routing/reopen.ts','engine/automation/state-routing/repeated-act.ts','engine/automation/lifecycle-run/fact-observation.ts',
'engine/automation/lifecycle-run/dispatch/dispatch.ts','engine/automation/outside-graph/retries.ts','engine/automation/outside-graph/tests/observed.test.ts',
'runtime/automation-host/route-state/observe.ts','runtime/automation-host/route-state/host.ts','runtime/automation-host/route-state/effect.ts'].map(p=>'packages/fluxiq/src/'+p));
const owns=p=>!p.startsWith('packages/fluxiq/src/runtime/output-dispatch/admission/gateway/')&&!p.startsWith('packages/fluxiq/src/runtime/execution-observation/roots/')&&p!=='packages/fluxiq/src/runtime/execution-observation/index.ts'&&(exact.has(p)||prefixes.some(a=>p.startsWith(a)));
const files=ctx.files.filter(owns);
const scoped={...ctx,files,sourceFiles:ctx.sourceFiles.filter(owns),scriptFiles:ctx.scriptFiles.filter(owns)};
const ids=['imports','import-cycles','module-reach','exported-values','as-never','naming','directory-files','file-lines','class-methods','statement-packing','test-placement','web-vocabulary','swallowed-failure','failure-as-empty','restricted-references'];
let failures=0;
for(const name of readdirSync('./scripts/structure-audit/rules').filter(n=>n.endsWith('.mjs'))){
const rule=await import('./scripts/structure-audit/rules/'+name);if(!ids.includes(rule.id))continue;
let selected=scoped;
if(rule.id==='module-reach'){
  const boundaries=ctx.CONFIG.reachBoundaries.map(b=>({...b,from:ctx.scriptFiles.filter(p=>owns(p)&&!ctx.isTestFile(p)&&b.from.some(prefix=>prefix.endsWith('/')?p.startsWith(prefix):p===prefix))})).filter(b=>b.from.length);
  selected={...ctx,CONFIG:{...ctx.CONFIG,reachBoundaries:boundaries}};
}
const found=rule.run(selected);const bad=found.filter(f=>f.severity==='fail');for(const f of bad) console.log(JSON.stringify({rule:rule.id,...f}));failures+=bad.length;
}
console.log(JSON.stringify({files:scoped.sourceFiles.length,rules:ids.length,failures}));
process.exitCode=failures?1:0;

let whitespace=0;
for(const file of scoped.sourceFiles){const value=ctx.read(file);const lines=value.replaceAll('\r','').split('\n');for(let i=0;i<lines.length;i++){if(/[ \t]+$/.test(lines[i])){console.log(JSON.stringify({path:file,line:i+1,issue:'trailing whitespace'}));whitespace++;}}if(/\n\n$/.test(value.replaceAll('\r',''))){console.log(JSON.stringify({path:file,issue:'extra EOF blank line'}));whitespace++;}}
console.log(JSON.stringify({whitespace}));
if(whitespace)process.exitCode=1;
```

## Not verified

- Lead-owned combined package checks/build, normal library/downstream integration, actual composed A2 SQL/gateway plus candidate path, browser/provider behavior. A2's independent real-SQL results are not claimed as this worker's validation.
- Unsupported/custom first-run callbacks earn no new certificate. Whole offline/custom Flow execution needs its own original replay/no-direct-effects authority; the pure callback read-only helper does not certify a Flow from environment/matcher flags.
- Arbitrary trusted-local native code remains outside containment; unadapted ambient/direct work stays unverified/pending. No page-only reconciliation or candidate bypass was wired.

Lead independently accepted the complete 22-file / 195-test command in 21.39s. After that acceptance, read-only review found that a direct successful self-loop keeps the same arrival object. Lead released only graph-run's private series seam plus its immediate producer test. The new self-loop oracle failed before the change and passed after it; scheduled-retry counter cases stayed strict. The affected run passed 2 files / 14 tests, strict NodeNext checking of graph-run plus producer tests exited 0, and the same 15-rule/whitespace scope over those 2 files reported zero findings. The complete acceptance command now has one additional test (expected 196).

SOURCE FROZEN again after this exact fix. No native binder or IO registry source was edited after their release to R5. No process remains running.
