# D2: actual loop admission and private prior-call batching

Source status: **FROZEN** before this report. The lead may begin acceptance. No checks, builds, audits, git commands, browser launches or provider operations were run by this worker. Source inspection only; the tests described below are authored, not claimed passing.

## Changed files

All paths in this list start at `packages/fluxiq/src/programs/automation-studio/runtime/`:

- `llm/evidence-loop.ts`
- `llm/loop-configuration.ts` — only the host-only `rerunAuthority` port; the lead's observed-state documentation is preserved.
- `llm/evidence-loop/index.ts`
- `llm/evidence-loop/tool-withdrawal.ts`
- `llm/prior-nodes/index.ts`
- `llm/prior-nodes/authority.ts`
- `llm/prior-nodes/identity.ts`
- `llm/prior-nodes/controller.ts`
- `llm/prior-nodes/admission.ts`
- `llm/prior-nodes/loop.ts`
- `llm/prior-nodes/batch-member.ts`
- `llm/prior-nodes/tool-admission.ts`
- `llm/prior-nodes/settlement-context.ts`
- `llm/prior-nodes/tests/fixtures.ts`
- `llm/prior-nodes/tests/authority.test.ts`
- `llm/prior-nodes/tests/tool-admission.test.ts`
- `llm/prior-nodes/tests/run-nodes-loop.test.ts`
- `llm/prior-nodes/tests/service-wiring.test.ts`
- `service.ts`
- `service/project-build/brief-ports.ts`

The lead approved moving the new integration feature out of `evidence-loop/prior-nodes/` into `llm/prior-nodes/`. This keeps its owning tests within the directory-depth budget and restores `evidence-loop/tests/` to 25 files, including the lead's E test. Source inspection counted `evidence-loop.ts` at 797 lines. No baseline change or statement packing was used for the new feature.

No accepted C `node-reruns/`, D0 `rerun-provenance/`, A/B, Down, P10, version or baseline source was edited. The report itself is the only document authored here.

## Actual authority wiring and lifetime

`service.ts` constructs `automationStudioLlmPriorNodesRuntimeAuthority` beside the real build permission/person-needed wrappers. It supplies getters for the service's **current** NativeNodeRuntime and evidence runtime binding, the actual build creation/permission objects, the Flow's scope and the active person-needed signal. Both ordinary candidate startup and the legacy build round receive this port. Project brief startup inherits it and adds that brief's own permission/generation objects and cancellation signal. Candidate and subflow builder loops already preserve these inputs through their existing `...input.loop` seams; no new public/model JSON field is involved.

The authority helper checks canonical availability/executability/version using `runtime.sdk.nodes.get` under `runtime.getRegistryResolution(scope)`. Effect resolution calls the actual `NativeNodeRuntime.resolveActionEffect`, including canonical policy-output composition, rather than catalog/help text. A private registry identity changes when the live runtime changes or the visible canonical definitions, output-floor definitions or resolution change, even at the same advertised version. Binding getters and permission signals are read again for scope checks. Operational permission, target and receipt guards still run through the original executor for every member.

Every actual loop creates its own D0 provenance registry and loop object. Capture encloses the original fully wrapped executor; the admitted record is remembered only after the ordinary call returns and D0 has sealed its final result. Batch execution uses D0's stored executor and its original public request, with only a fresh actual member callId, the original reference instant and the signal. Concrete resolved parameters, effective inputs and adapter capsules travel through the private scope. The registry is disposed in the loop's `finally` block, including failed/throwing loop exits. A resumed or restarted loop's old callIds cannot restore it.

The private C adaptation uses only sealed D0 records. Stable WeakMap identities for the true loop/binding/registry/authority and semantic subject participate with the original reference instant in the authority hash. The list world hashes the actual seen state and draft, without mutation/attempt epochs or per-call nonces. C retains its canonical concrete parameter/effective-input identity; the ordered list guard stores only its hash. Aliased node spellings and different original callIds do not grant a second identical list in the same world.

## Admission, settlement and public shape

The shared `tool-admission.ts` computes the ordinary current-tool, withdrawn-look, final-slot/deadline, answered-cache and repeat-outcome gates. Ordinary dispatch consumes the same facts through its existing handlers; the extracted withdrawal helper preserves its refusal/history/no-progress behavior. A private member checks both its original public request and its canonical node selector under the currently offered node schema. Every member rechecks live eligibility, wrap-up withholding, cancellation, deadline, tool quota, purse/allowance state and no-progress state. The last dispatch gate is checked again after any asynchronous digest hook. Successful-original list intent bypasses only that successful answered-cache entry; it does not bypass a failed/no-progress outcome, withdrawal, unavailable authority or permission guard.

`core.run_nodes` uses the accepted stable `{calls:[priorCallId,...]}` schema. The caller's own tools cannot install that reserved batch id. Core offers it only while an ordinary run-node capability and eligible sealed originals are available. Candidate ids appear in a separate dynamic tail after the normal shown context; no changing candidate enum is placed in the provider schema.

Each member receives a fresh id and settles through `runCall` with an explicit private batch member. This keeps actual accounting, result/failure/actionability metadata, digests, repeat/no-progress accounting, screened ordinary evidence and history. A real receipt survives a later digest failure. Private errors/receipts remain available in C's internal result/cause path but never enter the envelope JSON. An unacted pre-dispatch refusal does not update the answered cache, reset the action-retest state or spend a tool call.

Batch settlement never appends a draft step, applies add/act/place, replaces a step, drops reversals, repositions, replays a prefix, resets, writes datasets or invokes automatic recovery. Its failed-member handler also records the actual failed call without adding a draft step; the original end-on-failure policy still ends the loop. The ordinary single-call path retains its authoring/rerun/recovery behavior.

The envelope emits only `status`, requested/executed/skipped counts and, where applicable, a closed stopping index/reason. It never serializes C's result, identity, raw receipt/error or original. Executed counts come from actual member tool accounting; the envelope itself adds no tool call or draft node. The outer provider decision usage is accounted once; member decisions carry none. This operation supplies no judged whole-Flow success. First failure, changed code, uncertainty, lost authority, cancellation or exhausted allowance stops later members and retains earlier evidence/receipts.

## Authored acceptance selectors

New owning selection:

```text
pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/prior-nodes/tests
```

- `authority.test.ts`: actual registered NativeRuntime canonical effects/output composition, unaccounted effective inputs, runtime/registry/binding/cancellation changes, stable opaque subject/resource identity and reference-time distinction.
- `tool-admission.test.ts`: ordinary successful answer-cache behavior, the narrow explicit-list bypass, retained failed outcome, withheld/unoffered capability, final slot/deadline and canonical node selector.
- `run-nodes-loop.test.ts`: actual loop offering and dynamic candidates, original private transport, ordered execution/fresh ids, exact usage/tool counts, no member draft additions, absent/overridden provenance, canonical alias/list repeats, withdrawn tool/node, changed binding/effect, partial failure/code change/uncertainty/person-needed/throw, quota/time/cancel/purse stopping, wrap-up, no recovery at the look guard, default failed-member trace and restart refusal.
- `service-wiring.test.ts` (`real-sql`): actual service startup for ordinary candidate and project subflow authoring, intercepted at the actual loop boundary; verifies a usable non-mocked canonical NativeRuntime effect port exists under the real permission scope. The probe cancels before authoring or testing a Flow; its provider is deterministic and local.

Relevant existing regression selectors for the lead, alongside accepted C/D0 checks as desired:

```text
src/programs/automation-studio/runtime/llm/tests/evidence-loop.test.ts
src/programs/automation-studio/runtime/llm/evidence-loop/tests/wrap-up-not-offered.test.ts
src/programs/automation-studio/runtime/llm/evidence-loop/tests/final-decision-row.test.ts
src/programs/automation-studio/runtime/llm/evidence-loop/tests/rerun-place.test.ts
src/programs/automation-studio/runtime/llm/evidence-loop/tests/rerun-replacement.test.ts
src/programs/automation-studio/runtime/llm/decision-handlers/tests/stall-recovery.test.ts
```

## Limitations and unverified behavior

- **All new and affected tests, type checks, structure checks and builds remain unrun by this worker.** The lead owns acceptance after this freeze. The authored service probes and their cancellation/cleanup behavior are not yet verified.
- The current NativeRuntime effect declaration resolves parameters only. This integration deliberately refuses **nonempty** effective node-port inputs rather than claiming their dependencies are accounted for. Explicit `{}` is required and supported; a richer trusted resolver is required before nonempty inputs can qualify.
- Native registry authority alone cannot mint execution provenance. Clients without a trusted capture/execution adapter, missing receipts or overridden successful-looking results never enable batching.
- Actual paired Down capsule execution, browser session/resource/subject validation, provider-free paired integration and browser behavior are for the lead's later acceptance. No browser, paid model or live provider was exercised here.
- No full sweep was run; no source version, SDK artifact, baseline, git branch or published state was changed by this worker.

Outcome: Done
Changed: the 20 runtime source/test paths listed above, plus this report
Validation: not run — written brief reserves all checks/builds/audits to the lead
Not verified: all authored/affected tests, types, structure, build, paired-domain integration and live browser behavior
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d2-implementation.md`
Notes: Source frozen. Real runtime authority is wired through candidate/legacy/project brief startup. Nonempty effective inputs fail closed.
