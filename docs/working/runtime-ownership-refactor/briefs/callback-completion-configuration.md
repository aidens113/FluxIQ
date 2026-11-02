# Snapshot trusted callback completion configuration
Role: Heavy worker; gpt-6.1-sol, Max. No git/agents/shared docs/baseline changes.
Goal: narrow generic declaration snapshot policy for original host/raw-tool/writer callback contracts before source configuration.
Repo: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ.
Stable lead API under runtime/execution-observation/configuration:
ExecutionCallbackRegistrar.manage<TReceiver,TArguments extends unknown[],TResult>(registration:ManagedExecutionCallbackRegistration<TReceiver,TArguments,TResult>):void.
ExecutionCallbackCompletionConfiguration.configure(registrar:ExecutionCallbackRegistrar):void (synchronous declarations only).
ExecutionCallbackCompletionPolicy.apply(registrar:ExecutionCallbackRegistrar):void.
captureExecutionCallbackCompletions(configuration:ExecutionCallbackCompletionConfiguration):ExecutionCallbackCompletionPolicy.
Own new {registrar,configuration,policy,capture,index}.ts + immediate tests ONLY; no Source/class/contracts/parentbarrel/service/composition/config/scripts edits.
Read existing ManagedExecutionCallbackRegistration, Source.manage and native pin semantics; do not duplicate callback/evidence DTO authority.
Root already added additive consumeCompletion.returned?:TResult (original unawaited return) for authentic private async-void promise receipts; not a result-status issuer. Raw/native/model args gain no fields/handles.
Capture configure original method+receiver once immediately; snapshot each actual callback/receiver/binding/contract/reader, binding original reader receiver before later mutations. Generic closure preserves tuple types without any/casts if possible.
Return frozen policy and frozen registration actions; policy.apply forwards to supplied manage-only registrar. A2/native/source registries remain sole authorities; configuration itself cannot reserve/enter/finish/claim or assert baseline.
Reject late configuration changes; reject unsupported async configure safely without detached rejection; do not silently drop late declarations. Unrelated callback bodies remain unsupported absent original explicit contracts.
Tests: original private configure/reader receivers; method/property/array mutation aftercapture; exact pair matching and counterfeit same-namefn; managed async-void ORIGINALpromise receipt vs copied/rejected/unknown; late/async configuration; source unchanged default/no registration.
Actual Source integration tests use original fixture-owned effects/receipts, not wrappers that call themselves complete from status/count/page/reset replies.
Root will export parentseams and capture ServiceOptions.executionCallbackCompletions + optional bindHostRuntime2nd config, then apply snapshots to callbacks/automation via manage-only facade BEFORE first reserve; don't edit those files.
Run focused new tests + source-closed strict + scopedstructure/EOF; no fullsuites/build/provider/browser.
Own report: docs/working/runtime-ownership-refactor/reports/callback-completion-configuration.md.
Return Outcome, Changed, Validation, Not verified, Report, Notes<=3 lines.
