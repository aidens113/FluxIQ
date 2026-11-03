# Native model exchange-log completion

Outcome: READ-ONLY discovery/design complete. Package source/tests remain FROZEN; no runtime/compiler/build/provider/browser checks or private/runtime values were read. This is source evidence, not completion acceptance.

## Exact current path

- Studio `runtime/llm/anthropic/provider.ts` and `deepseek/provider.ts` install ORIGINAL `automationStudioLlmStepLogModelStep` as `transport.observe`. Canonical `runtime/models/providers/anthropic/messages.ts` and `deepseek/completion.ts` invoke that exact callback with receiver ORIGINAL transport input and tuple `[ModelTransportCall]` through `ModelTransportExecution.invoke`.
- After its return, both canonical transports pin ORIGINAL step.reply/succeeded/failed before the provider await, then invoke each with receiver ORIGINAL returned step and unchanged tuples `[raw,status]`, `[response,usage]`, `[error]`. The current source calls this callback `observe`; there is no existing method named observeTask.
- Anthropic logs raw bytes only AFTER answer/credential validation, then success. DeepSeek logs buffered raw bytes before parsing; unsuccessful/non-JSON replies use a bounded cloned response, whose logging read is best-effort. Preserve both orders exactly. Failure cleanup already aggregates `[primaryFailure, cleanup]` if its observer throws.
- Studio `llm/anthropic/messages.ts` installs the same logger for its legacy wrapper; `llm/deepseek/panel-command.ts` calls it and the returned void methods directly. These unobserved routes are compatibility consumers, not evidence that completion exists.
- Actual mechanism remains `llm/step-log/model-step.ts`: absolute directory -> numbered folder -> started time/metadata scope/attempt -> request.json -> request.txt -> returned step. reply writes response.json, renders it, retains envelope/finishReason, then response.txt. First finish sets done=true BEFORE its try, writes decision.json, selects usage, optionally prices, summarizes, writes meta.json LAST in the folder, then index.md.
- Root already moved the real writer/folder/listing/numbering/scope/text/screen/naming owners to `framework/observability/exchange-log/**`; old step-log leaves are aliases. Reuse those bodies and existing single caches. Metadata-only AsyncLocalStorage remains metadata, never execution context or authority.

## Actual native/callback frontier

| Owner | Actual work and swallowed boundary |
| --- | --- |
| directory.ts | Reads FLUXIQ_LLM_STEP_LOG_DIR; absent/empty/relative returns before ANY filesystem operation. This original branch can genuinely attest no direct effects. |
| folder/open.ts | mkdirSync(root,recursive), readdirSync(root), then exclusive mkdirSync(step), retrying EEXIST; updates existing lastGiven after success. FolderRefused accepts errno-shaped codes; model-step returns undefined after such failure. This undefined is NOT the disabled branch. |
| writer/create.ts | Every text write screens credentials, then ORIGINAL writeFileSync. put catches every failure. json falls back to an unserializable marker; meta screens and serializes again. A fulfilled void method reveals none of those native outcomes. |
| listing/write.ts | Existing rows cache may first readdir/exists/read every completed meta; SyntaxError/ENOENT entries are skipped. It updates that SAME cache, screens rows, writes temp index, renameSync; rename/write failure falls back to direct target write, then outer catch swallows failure. Preserve cache, ordering, text and temp-file behavior. |
| model-step reply/finish | Both catch broadly; done prevents a second finish even if first finish failed. No later success callback may erase an earlier unknown native write. |
| pricing | `priced` later reads/calls ORIGINAL call.price with receiver ORIGINAL call and one fresh usage object. No usage/already-estimated cost means it is not called. RangeError is left unpriced; other failures are swallowed by finish's outer catch. Neither branch proves an arbitrary callback had no effects. |
| presentation/time | Known request/response rendering and screen helpers are already canonical. Existing summary.model interprets authoring decisions/content; inject the original presentation callback instead of copying page/tool interpretation into native infrastructure. Native Date.now reads occur at start/finish/index-temp naming; an arbitrary supplied clock/format function is not automatically pure. |

## Smallest coherent implementation seam

1. Keep public `ModelTransportObserver(call): ModelTransportObservation | undefined` and ALL public void step methods unchanged. Legacy calls start synchronously, retain exact request/reply bytes and never start returning Promises. Keep old explicit env argument and best-effort results.
2. Add ONE Core-created internal observed logger port, supplied by the real default provider factory through a separate INTERNAL transport option, never ModelRequest/body/fetch options. Exact proposed shape: `{readonly observer: ModelTransportObserver; observeTask(call: ModelTransportCall, execution: ModelExecutionOptions): Promise<NativeModelLogExchange>}`. Its original exchange capability has `readonly legacy: ModelTransportObservation | undefined` and `reply(raw,status,execution): Promise<void>`, `succeeded(response,usage,execution): Promise<void>`, `failed(error,execution): Promise<void>`. Parameter types are the existing observer method tuples; no new payload DTO.
3. The capability retains ORIGINAL legacy observer/step and ORIGINAL function identities; the transport checks the exact default binding before using the corresponding internal entry. Its actual internal entry is pinned as the observed typed call; a private-field owning instance rejects copied/substituted receivers without another registry. Disabled logging still returns an authenticated exchange whose legacy field is undefined; only the actual owner's branch receipt proves completion. Supplied observers stay on their original exact callback path; names, shapes, status, environment labels and undefined do not select the native port.
4. Public and internal entries share the actual logging bodies/state once. Extract model-step lifecycle into canonical `runtime/models/exchange-log/**` (contracts alias existing ModelTransportCall/Usage/Observation); Studio keeps only default presentation/compatibility composition until its own required owner migration. Do not copy the existing native helpers or their caches.
5. Each observed entry prepares its OWN actual child with existing prepareObservedExecutionCallback and receives its OWN ModelExecutionOptions observation before any native work. Retain that ORIGINAL returned Promise; use the existing OriginalExecutionPromiseReceipts issuer/consumer. No observation property goes onto the public step, raw reply, response, error or wire. Never reuse the closed observeTask child for reply/finish.
6. Existing framework writer/folder/listing bodies gain explicit INTERNAL native-driver entries sharing their legacy algorithm. The narrow driver pins ORIGINAL Node native functions/receivers/tuples and performs those actual synchronous operations; its per-call private state latches actual ACK/error before the presentation catch. It is created only by the native owner, not accepted from model/host data.
7. Keep observation/Policies/OriginalPromise issuance in the runtime bridge; framework native helpers need only that explicit narrow driver port, with no runtime Source lookup, new WeakMap registry, second receipt system, ambient context or receiver binding. A per-call native operation state is owner evidence, not another durable ledger.
8. The owner issues a canonical receipt only after its actual native sequence completed, all required native acknowledgements exist, no swallowed IO failure was latched, and every actual price/presentation child settled. Merely reaching return, finding files later or seeing a success/undefined value supplies no proof.
9. Native disabled-log execution is attested ONLY by the original owner's explicit pre-filesystem branch, not by testing returned undefined. A refused folder, partial request/reply/meta/index write, rename failure (even if public fallback later succeeds), swallowed format failure or missing receipt remains unknown under this brief's strict failure policy.
10. Keep first best-effort return/void outwardly; unknown must be marked/flushed by the observed owner before another transport callback/send enters. Public unobserved disk-refusal behavior stays unchanged. An actual provider failure plus observer/flush/release failure preserves both originals in the existing aggregate order; never log raw exception data.

## Price, presentation and lifetime details

- Pin call.price and ORIGINAL receiver/usage tuple before an observed await; do not reconstruct a price function later. DeepSeek's concrete closure at `runtime/models/providers/deepseek/completion.ts` delegates only to existing pure pricing math over pinned model/sentAtMs; register ONLY that original created pair there. Panel pricing remains legacy until its real observation entrance is migrated.
- Arbitrary supplied price/render/summary callbacks require their own current-child contract and genuine completion; an outer native logger declaration cannot hide them. Observe the original method/receiver/tuple. RangeError may still leave public cost undefined, but unsupported/unknown callback work cannot earn clear coverage.
- Keep exact existing request-text fallback, response envelope/finish reason, paid/refusal/envelope usage precedence, price-skip conditions, redacted latch, meta-last, scope role/brief/phase and index rows. No browser/page summary algorithms move merely to simplify imports.
- Concurrent exchanges retain independent body/envelope/done/native invocation state; existing numbering/index caches remain sole authorities. Copied/rebound port/step, a stale prior callback observation or a sibling's completion cannot settle another current call. Do not capture a currently entered parent in a long-lived step closure.
- Generic Source/invoke/Sync semantics remain unchanged. A default logger port is native implementation selection, not a pure frame or blanket managed grant for arbitrary observers/metrics/logging.

## Disjoint source ownership and integration

| Unit | Exact bounded paths |
| --- | --- |
| Native helper augmentation | `framework/observability/exchange-log/{writer,folder,listing}/**` plus new internal native-driver port; preserve existing caches/exports/legacy bodies, no second infrastructure copy |
| Logging lifecycle/receipts | new `runtime/models/exchange-log/**`; old `programs/automation-studio/runtime/llm/step-log/model-step.ts` becomes compatibility/default presentation adapter; old summary stays presentation-only pending its correct owner cut |
| Model transport bridge | `runtime/models/transport/{observation,execution/scope}.ts`, actual provider observer call sites in `{anthropic/messages,deepseek/completion}.ts`; exact price closure registration; raw fetch/request tuples unchanged |
| Default composition | Studio `llm/{anthropic/provider,anthropic/messages,deepseek/provider}.ts`; Root owns public parents/service/shared provider selection and any panel internal observed seam |
| Must not overlap | B active native secret/model secret owners; A active SQL/performance; shared Source/Bindings/Policies/receipt authority stays frozen unless Root separately releases a proven missing seam |

First dispatchable group is native driver + exact writer/folder/listing failure visibility with no provider integration; next lifecycle/internal port, then actual default factories/transport. Freeze signatures before workers edit their disjoint consumers. No unit may claim usable observed live providers until all three parts pass together.

## Focused acceptance required

- Preserve unchanged `llm/step-log/tests/{model-step,native-owners,scope,agent}.test.ts` and canonical screen tests: exact bodies/replies/files/index bytes, usage/price, redaction, attempt numbering/restart, metadata aliases, explicit void/undefined and unobserved refused-folder behavior. Use isolated synthetic directories only.
- Real native positive: original factory, actual mkdir/write/meta/index native calls, exact original receiver/tuple/Promise, genuine price child, no unknown history; default disabled native branch permits the first real controlled fetch with zero log IO.
- Negative: folder refused, request/reply/decision/meta/index failure, rename fallback, swallowed serialization/price failure, unsupported callback fulfillment, original native write then missing/throwing receipt. Preserve first result/error and sticky unknown; no second controlled fetch/reset/send after same continuation/reopen.
- Held ACK: owner completion publication held after actual write, no receipt/next transport yet; release genuine ACK then continue once. Missing/copy/foreign/stale/original-Promise mismatch cannot settle; completed files are not a substitute receipt.
- Concurrent two exchanges, repeated reply/finish/done behavior, callback replacement while awaiting price, sibling observation swap, aborted native receipt flush and primary+cleanup aggregation. DeepSeek cloned-refusal log catch must not erase a tainted observation; real body-drain ownership remains separate.
- Normal declarations/public export closure and targeted model/provider/log integration run only after all imported source owners freeze; no full suite/provider/browser is authorized here.

Validation: source-only named path/call-site inspection; no checks executed. Blocker to completion is REAL native ACK/failure visibility plus per-call internal option forwarding, not a generic Source change.
Not verified: proposed API/type/byte parity, actual default provider admission and all positive/negative tests; none is implemented by this report.
Report: docs/working/runtime-ownership-refactor/reports/native-log-completion-plan.md
Notes: All package source/tests remain FROZEN; no processes. Only this own report changed; no git/shared documents/runtime or secret values.

## Stage2 interface readiness after accepted Stage1

Stage1 is independently accepted:20focused cases, strict15roots/23sources0,decl0/foreign0,scoped13files0fail/warn; actual original parity10bodies/4initializers/12native cases0differences. See native-log-driver.md. Stage2 SOURCE REMAINS HELD until Root's common Service/type/build checkpoint.

- Reuse existing `ModelTransportCall`, `ModelTransportUsage`, `ModelTransportObservation` and `ModelExecutionOptions`; no replacement request/context/data DTO.
- Proposed Core-only input field: `nativeLog?: NativeModelLogPort`; `observe` remains the original public observer. A native path requires the exact original own-data `observe === nativeLog.observer` pair pinned before await; unsupported/replaced accessor is not executed to establish identity. Legacy unobserved observer behavior remains.
- `NativeModelLogPort`: `readonly observer: ModelTransportObserver`; `observeTask(call: ModelTransportCall, execution: ModelExecutionOptions): Promise<NativeModelLogExchange>`.
- `NativeModelLogExchange`: `readonly legacy: ModelTransportObservation | undefined`; `reply(...args: [...Parameters<ModelTransportObservation["reply"]>, ModelExecutionOptions]): Promise<void>`; equivalent succeeded/failed typed tuples. These are ORIGINAL code capabilities, not model/host values. Native factory constructs its own legacy observer/body; it cannot certify an arbitrary passed observer.
- Runtime pins current internal entry receiver/function/tuple, prepares that exact child, and supplies its child observation through the SAME fresh internal execution carrier pinned in that tuple. Each entry creates a NEW NativeExchangeLogInvocation; only original actual native facts plus completed callback children can issue existing OriginalPromise receipts.
- Long-lived exchange state contains only original log state (folder/writer/redacted/envelope/finishReason/httpStatus/done/call/presentation pairs); NEVER SourceContext, callback observation, prepared handle, old driver or cached parent. No new Scope/Bindings/receipt registry. A closed observeTask child is never reused by reply/finish.
- One lifecycle owner shares exact begin/reply/finish phase bodies. Finish phase1 retains done=true/decision write/usage selection; observed price and summary run at the original positions; shared publication writes meta last and index. Separate sync legacy and async observed entry runners do not duplicate rendering/usage/native algorithms or change legacy return types.
- Runtime owner latches native failed/unsupported/unused as incomplete unless it directly authenticated the exact original pre-IO disabled/already-done branch; no inference from undefined/status or empty children. Unsupported fulfilled supplied callback marks unknown and awaits flush before another transport entry; primary+cleanup errors retain originals.

| Proposed next owner | Exact paths; all remain unedited |
| --- | --- |
| Lifecycle + capabilities | new `runtime/models/exchange-log/{contracts,entry,begin,reply,finish,presentation}/**` and barrel; old `llm/step-log/model-step.ts` only compatibility/default presentation composition; immediate canonical/compat tests |
| Actual transport forwarding | `runtime/models/transport/{observation,execution/scope}.ts`; `runtime/models/providers/{anthropic/messages,deepseek/completion}.ts`; DeepSeek original price pair declaration and current-child tests |
| Default factories | Studio `llm/{anthropic/provider,anthropic/messages,deepseek/provider}.ts`; pin actual native port once at source composition, never from serialized requests; keep raw fetch/provider tuples unchanged |
| Root shared integration | parent/public exports for Stage1 native entries + new lifecycle feature, service/_shared default provider selection; any later panel observed entrance is an explicit separate slice |
| Frozen dependencies | existing Source/Bindings/Policies/OriginalPromise receipts and accepted Stage1 native drivers/helpers; Bsecret and Aother active source excluded |

First release should fix those capability signatures, then implement lifecycle/controlled real-native positive+held/failure tests before modifying default providers. Final composed tests require the actual original provider body/drain +log native ACK +price/presentation children; no live/provider tests are authorized by this readiness note.
