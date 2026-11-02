# Model And Agent Ownership Migration

Outcome: Done — approved provider/agent cut and bounded integration fixes implemented. SOURCE FROZEN.

## Implemented ownership

Canonical roots are `packages/fluxiq/src/runtime/models/index.ts` and `runtime/agents/index.ts`. They currently hold 64 model production modules and 35 agent production modules, including barrels. No canonical source imports Automation Studio, including erased type imports. Old source paths retain forward compatibility exports or program-specific adapter wrappers.

All paths below are relative to `packages/fluxiq/src`.

| Former Studio responsibility | Canonical authority |
| --- | --- |
| Provider metadata, usage, input measurement and caller DTOs; provider interface | `runtime/models/contracts/**`; generic `ModelProvider<Request extends ModelRequest>` |
| Model IDs, environment-selected default and provider labels | `runtime/models/catalog/**` |
| Context/token limits, input estimator and diagnostic DTO | `runtime/models/limits/**` |
| Provider error identity, normalization, bounded paid/reply/throw/refusal accounts, refusal parser and outage/unreadable tracking | `runtime/models/failures/**` |
| Bounded reads, signal races, balance classification and screened refusal transport | `runtime/models/transport/**` |
| Real provider retry/deadline execution, endpoint concurrency, hints and retry ledgers | `runtime/models/retry/**` |
| Session credential release and locked-key error | `runtime/models/secrets/**` |
| Anthropic HTTP/SSE execution, credential echo protection, provider schema encoding, cache content and billing | `runtime/models/providers/anthropic/**` |
| DeepSeek HTTP completion execution, endpoints, generic response-envelope/JSON recovery and billing | `runtime/models/providers/deepseek/**` |
| Monetary purse, attributed allowances/top-ups, settlement, judging reserves and async scopes | `runtime/agents/budget/**` |
| Multi-scope reservation/release/settlement for a model call | `runtime/agents/budget/call-hold.ts` |
| Opaque tool definitions, unique/scoped call IDs and token/cost accumulation | `runtime/agents/{tools,calls,accounting}/**` |
| Repeated-state/answer/issue tracking | `runtime/agents/progress/**` |
| Single bounded iteration driver actually used by the existing evidence loop | `runtime/agents/iteration/**` |
| Run reservation/settlement, receipt construction/restoration and receipt-change arithmetic | `runtime/agents/ledger/**`; Studio binds validators and defaults |

The lead approved extra old ownership of `programs/automation-studio/runtime/provider-refusal/**`; its record/parser and test were moved into canonical failures/refusal. No package exports/config/root runtime barrels/shared docs or git state were edited by this worker.

## Preserved program adapters

Studio's harness provider is its existing `AutomationStudioLlmProvider` specialized to the existing TaskRequest type. No Flow task schema enters generic model contracts.

Both actual task HTTP transports are moved. Anthropic uses the canonical Messages transport and stream reader. DeepSeek uses canonical completion and generic envelope handling. Studio retains request construction, task preflight, output-schema interpretation and the verification-specific truncated-verdict interpretation. Prepared body strings are handed to the transport unchanged. The exact model IDs, rates, usage arithmetic, errors, retries and timeout behavior remain in the moved implementations.

Canonical transport observation is an injected `ModelTransportObserver`, structurally matching the existing step-log observer. Studio binds its original logger at each adapter call. Credential release remains an injected resolver, with no retained credential or external call in tests.

Canonical refusal reading requires an injected text screen. The legacy `provider-transport/index.ts` deliberately exposes the Studio wrapper, rather than exposing the unspecialized canonical read function: all old entry points therefore keep the existing locator/evidence screen. A shallow `screening/index.ts` exports that retained policy without loading the complete task harness; `harness/locator-text.ts` is a compatibility facade.

The generic repeated-state guard emits progress facts through a callback. Studio's wrapper still builds its exact previous redirect message. Likewise, multi-scope call holding is generic, while Studio's `build-purse/harness-hold.ts` retains its exact refusal wording through a formatter callback. The stage-specific reserve table remains Studio policy.

The original evidence-loop `for` was removed. Its 32 return/continue points now return typed policy outcomes to `runAgentIterations`; the canonical driver is the sole iteration authority. Studio retains every Flow draft, amendment, completion, repair, cancellation and tool-admission policy. The outer finalizer awaits the driver before disposing provenance. No whole-Flow test/reset/repair policy was changed.

## Validation

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/models src/runtime/agents src/programs/automation-studio/runtime/llm/models/tests/framework-compatibility.test.ts src/programs/automation-studio/runtime/llm/build-purse/tests/ownership.test.ts src/programs/automation-studio/runtime/llm/build-purse/tests/allowance-wording.test.ts src/programs/automation-studio/runtime/llm/evidence-progress/tests/no-progress.test.ts` -> **22 files passed; 111 tests passed; 4.42s**.

Validation: `node --input-type=module` (inline createContext probe scoped to canonical models/agents; imports, exported-values, as-never, naming, directory-files, file-lines, statement-packing, import-cycles, test-placement, failure-as-empty, swallowed-failure, regexp-template-escapes) -> **108 script files; zero failures across 12 rules**. No baseline was written or remapped.

Validation earlier in the cut: focused Studio leaf suites for Anthropic provider/schema/pricing, DeepSeek request-body/refusal/envelope/signal race and provider retry call/policy -> **8 files passed; 102 tests passed; 19.82s**. The body/schema/paid-refusal assertions used mocked providers. Some retry/schema test paths were subsequently relocated below their canonical owners.

Fourteen existing subject test files were relocated into canonical owning `tests/` folders. The allowance scenario that asserts Studio-specific wording was relocated intact to the Studio formatter's owner. Added closure tests that follow static imports/exports and import-type nodes transitively, generic driver/progress policy tests, direct mocked transports, and legacy singleton compatibility tests. Canonical tests import no Studio module.

The first canonical run passed 106/111 tests; five failures exposed that the moved allowance tests also exercised multi-scope call holding. That implementation was then extracted, with Studio wording injected. One wording-only scenario was moved intact to Studio and its missing local helper was restored; the final run passes all 111 assertions/tests. Carried packed statements were split. The hostile-error getter catch now returns an explicit unreadable discriminator before the existing untyped-failure normalization, rather than masking a caught read failure as absence.

An exploratory audit restricted to the legacy llm subgraph reported 53 findings. It is not an acceptance result: import-cycle baselines and barrel cycle exemptions require the complete repository graph. Its actual local directory-budget and screen-barrel issues were fixed. No unrelated authoring code was changed in reaction to that incomplete graph. The lead must run the complete-graph structure/import audit at the source-stable integration checkpoint.

Not verified: whole-library typecheck/build, full-graph audit, existing Studio evidence-loop/build integrations, exact whole-loop traces after the driver extraction, or any live model/browser behavior. These are the lead's integration checks after all source lanes freeze. No paid calls, panel management, full sweep, commits or pushes were performed.

## Remaining Studio inventory

Classification is by responsibility, not filename. Pure compatibility barrels are not counted as new program implementations. `model-facing/**` was excluded from edit ownership.

| Remaining group/files | Classification |
| --- | --- |
| `provider-task/**`, `diagnosis-instructions.ts`, task/context/schema/result/intervention parts of `harness/**` | Studio task schemas, prompts, evidence policy and result validation; retained intentionally. Generic provider/token/diagnostic ports are already canonical. |
| `anthropic/provider.ts`, `anthropic/panel-command.ts`; DeepSeek task provider/request/preflight/request-shape/output-schema/system-prompt/verdict adapters | Studio specialization and command/task interpretation; retained. Generic transport operations are canonical except the explicit mixed cases below. |
| `provider-factories.ts`, `session-key-provider.ts`, `runtime-session-llm.ts`, `resolver-contract.ts`, `purse/**`, `flow-execution-limits/**` | Studio model-settings/session/service composition. The old run ledger and receipt files now bind canonical algorithms to Studio vocabulary/defaults. |
| `candidate-receipt/**`, `decision-handlers/**`, `domain-instructions/**`, `draft-amendment-feedback/**`, `harness-options/**`, `node-reruns/**`, `node-tools/**`, `prior-nodes/**`, `rerun-arguments/**`, `rerun-provenance/**`, `resolved-control-intent/**`, `stages/**`, `verification-{checked,defects}/**` | Flow authoring, tool catalog, admission, graph edits, verification/completion/repair policy; retained intentionally. |
| `evidence-loop.ts`, remaining `evidence-loop/**`, `loop-budget.ts`, `loop-configuration.ts`, `refused-action-retest.ts`, `repeat-policy.ts`, `repeat-guard/**` | Flow-draft authoring and exploration workflow policy using canonical budget/iteration/progress ports. Remaining pure helpers can be reconsidered through their actual public consumers rather than moving the coupled workflow wholesale. |
| `context-window.ts`, `decision-context/**`, `evidence-recall/**`, `evidence-diagnostic/**`, `recent-actions/**`, `step-log/**` | Studio evidence/current-Flow projection, prompt history, recall and diagnostic presentation/log adapters. Canonical transports consume observer ports instead. |
| `failed-decision/**`, `configuration-issue/**`, `tool-failure.ts`, `unknown-tool/**`, `unusable-decision.ts`, remaining `evidence-progress/**` | Authoring feedback, refusal/completion wording and Flow progress/trace composition. The generic state guard is extracted; remaining policy adapters stay here. |
| `model-facing/**` | Existing Studio/model guidance; explicitly excluded from this worker's edits. |
| `model-limits/**`, `models/**`, `provider-retry/**`, `session-keys/**`, `throw-account/**`, `provider-contract.ts`, `reply-account.ts`, `model-caller.ts`, `token-estimation.ts`, `failure-disposition.ts`, `unanswered-calls.ts`, `unreadable-reply.ts` | Compatibility exports to canonical authority. The old models barrel additionally preserves Studio run-cost-setting constants. |
| `provider-transport/refusal.ts`, `build-purse/harness-hold.ts`, `build-purse/build-call-reserves.ts` | Intentional program adapters for refusal screening, wording and stage-specific reserve policy. Other build-purse and transport implementations are canonical. |
| `tool-call-keys/folded.ts` | Mixed schema normalization and Studio-reserved `add/act/place/write` grammar. A future generic fold would need the reserved metadata keys injected; current behavior is preserved in Studio. |

## Initial checkpoint findings ? completed in integration brief

The initial checkpoint identified the three mixed owners below. The lead assigned `model-integration-fixes.md`; all three are now completed as described in the completion section. The following paragraphs preserve the original closure reasoning.

1. **Run-budget ledger and receipt accounting.** Old sources: `programs/automation-studio/runtime/llm/run-budget.ts`, `run-call-record.ts`, `flow-execution-limits/run-call-backstop.ts`, plus settings adaptation in `flow-execution-limits/run-cost-ceiling.ts` and `purse/profile.ts`. Canonical destination: `runtime/models/accounting/**` (reservation/settlement/receipt types, parser and ledger). Inject the task-kind/stage validators and configured defaults from Studio's existing `harness/task-kind.ts`, `stages/protocol.ts` and Flow-cost settings; do not import those files canonically or widen validation. Preserve persisted receipt fields, exact charge provenance, restoration bounds, reservation identity and zero-call accounting. Old ledger/record exports retain their specialized task/stage types. Relevant tests are the existing run-budget/receipt/billing tests under `llm/tests` and DeepSeek billing tests.
2. **Panel-command DeepSeek HTTP reuse.** Old source: `programs/automation-studio/runtime/llm/deepseek/panel-command.ts`; canonical source to extend: `runtime/models/providers/deepseek/completion.ts` or a focused prepared-send collaborator under that same provider owner. Existing panel wire sends neither request/idempotency headers nor task timeout metadata and uses `redirect: "error"`, while Flow requests use manual redirect checks and explicit request IDs. Preserve those distinct wire/cancellation semantics through options rather than silently making panel calls look like Flow task calls. Keep conversation schema, transcript encoding and command interpretation in Studio. Relevant leaf tests: `deepseek/tests/panel-command.test.ts`, stalled-response/refusal and signal tests.
3. **Generic Anthropic body encoding.** Old source: `programs/automation-studio/runtime/llm/anthropic/request.ts`. Move `automationStudioAnthropicMessageBody` and the exact JSON-text transport instruction to `runtime/models/providers/anthropic/request-body.ts`; keep `automationStudioAnthropicRequest`'s task-message/schema selection in Studio. Canonical schema/cache/model-limit dependencies are already closed. Preserve body bytes, cache breakpoints, model maximum output setting and every original prompt byte. Relevant tests: `anthropic/tests/cache-content.test.ts`, provider tests and the canonical schema/pricing suite.

Report: `docs/working/runtime-ownership-refactor/reports/model-ownership.md`.

## Integration completion ? 2026-11-02

SOURCE FROZEN. No source group in the integration completion brief remains unfinished.

- The diagnostic request-shape port is now recursively readonly (`runtime/models/contracts/request-shape.ts`). It accepts the existing readonly diagnostic message collections without casts or copying, preserving the diagnostic value and serialization.
- The screen implementation moved to the shallow Studio owner `llm/screening/locator-text.ts`, with its own barrel; the old harness leaf remains a forward facade. The depth-10 `harness/screening/index.ts` was removed. All existing refusal entry points still bind the Studio screen.
- The actual run reservation, settlement, receipt construction, restoration and receipt-change algorithms moved to `runtime/agents/ledger/{ledger,record,types,policy}.ts`. The canonical ledger receives its default ceiling/backstop/record limit and task/stage predicates as ports. Old `run-budget.ts` and `run-call-record.ts` now specialize those ports and preserve the original task/stage types and exact defaults. No duplicate ledger algorithm remains in Studio; record serialization, billed-versus-reserved provenance, once-only settlement, release and restoration checks remain authoritative in the canonical modules.
- DeepSeek task completion and panel commands now both call canonical `providers/deepseek/send.ts`. The panel keeps its exact three headers, error redirect mode, caller signal race, late-body cancellation and original failure messages. Task completion explicitly retains manual redirect checks, both request/idempotency headers and its existing surrounding timer/error normalization. Canonical `http-failure.ts` and the provider pricing module own the moved HTTP classification and envelope-cost arithmetic. Studio retains transcript/command interpretation.
- Anthropic `automationStudioAnthropicMessageBody` and the exact JSON-text transport instruction moved into canonical `providers/anthropic/request-body.ts`. Studio request assembly still selects its original task messages/schema and invokes that codec. Model maxima, cache fields, body layout and instruction text were not changed.

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/models src/runtime/agents src/programs/automation-studio/runtime/llm/tests/run-budget.test.ts src/programs/automation-studio/runtime/llm/tests/run-call-record.test.ts src/programs/automation-studio/runtime/llm/deepseek/tests/panel-command.test.ts src/programs/automation-studio/runtime/llm/anthropic/tests/provider.test.ts src/programs/automation-studio/runtime/llm/anthropic/tests/cache-content.test.ts src/programs/automation-studio/runtime/llm/models/tests/framework-compatibility.test.ts` -> **24 files passed; 170 tests passed; 21.69s**.

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/agents/ledger/tests/ledger.test.ts src/runtime/models/tests` -> **3 files passed; 7 tests passed; 1.84s**. The added generic ledger tests use a non-Studio task/stage policy and verify actual reported-dollar charging, once-only completion, duplicate request identity, atomic restoration/receipt deltas, refusal of out-of-policy labels and no invented spend for an unsent hold.

Validation: `node` (inline TypeScript API program using package compiler options and only canonical model/agent source/test roots) -> **118 roots; 0 diagnostics**. An initial probe caught a redundant `isRecord` import beside the provider's existing local predicate; removed the redundant import and reran successfully.

Validation: `node --input-type=module` (canonical-scoped structure probe, same 12 rules listed above) -> **118 files; zero failures**. Source-closure regression still follows every canonical model/agent dependency, including erased imports. No baseline change.

Not verified by this worker: complete-library compilation/build, complete-repository graph audit and whole Studio evidence-loop integration after all lanes settle. These remain the lead's integration gates. No paid calls, panel/browser work, broad suite, commits or pushes occurred.

## Cache integration regression closure — 2026-11-02

SOURCE FROZEN. Only `programs/automation-studio/runtime/llm/deepseek/tests/cache-placement.test.ts` changed for this bounded fix; no production request/cache/evidence source changed. R5 state/recording implementation remains unstarted.

Baseline: ran `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/llm/deepseek/tests/cache-placement.test.ts` from each checkout's `packages/fluxiq` directory. In `C:/Users/osrs_/FluxStuff/fxwork/t842/!FluxIQ`, observed **1 failed / 2 passed; 26.64s**. In original dev `C:/Users/osrs_/FluxStuff/!FluxIQ`, observed **the same 1 failed / 2 passed; 27.47s**. Both failures expected full `value.state` after the trial but received the established `baseSituation`/`updates`/`removed` protocol. Original checkout source was read-only throughout.

Read-only file comparison confirmed the cache-placement test, `route-state/delta.ts` and `route-state/build-routing.ts` were byte-identical across both checkouts before this fix. The latter explicitly documents full first baseline plus subsequent deltas; existing delta/shown-window tests reconstruct those states. The failing oracle therefore predates t842 and is not a provider ownership regression.

Replaced the stale partial full-state assertion with exact equality for all three projected values: the `/start` baseline, `/explore-1` delta from situation 1, and `/trial.step-1` delta from situation 2, including seen labels and empty removal lists. The test independently reconstructs each full state through its named prior state, refuses a missing base, and checks all three exact reconstructed states. Existing request byte-prefix, schema/tools/catalog placement, complete window order and historical placement assertions remain unchanged. No prompt/task/scenario guidance changed.

Validation: `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/llm/deepseek/tests/cache-placement.test.ts src/programs/automation-studio/runtime/route-state/tests/delta.test.ts src/programs/automation-studio/runtime/route-state/tests/shown-window.test.ts` (from paired Core `packages/fluxiq`) -> **3 files passed; 13 tests passed; 21.86s**.

Not verified: no broad suite, complete typecheck/build or live provider/browser behavior was run for this test-only correction. No paid calls, original-source edits, source group extensions, git operations or shared document edits occurred.
