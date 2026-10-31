# Installed native browser repeat proof — authored, not executed

## Frozen source

New downstream source: `apps/extension/e2e/site-reset/tests/runtime-repeat/tests/native.spec.ts` in the t829 paired checkout. Lead explicitly approved the only shared-helper edit: `installed-build.ts` gains `distinctActionCommands(): number` backed by the already-existing private `sentCommands.size`, with no ID exposure, additional retention or transport change. No production source, fixture, package, generated file, runtime data, or shared working document was edited. Static readback caught and corrected successful attempt status to Core's `succeeded` vocabulary. This is source authoring, not passing browser evidence.

Uses existing `startInstalledBuild`: real installed extension, isolated profile and Scenario Lab, real FluxIQ setup/domain registration/native registry, real websocket gateway, `loadEnv: false`, `modelProvidersEnabled: false`. The spec binds the actual `createWebAutomationHostRuntime` and passes each host dispatch unchanged to the real domain dispatcher. Saves the Flow instruction before each required-command runtime session with `adaptiveMode: no_llm_intervention`, no permitted consequences, no authorized external effects. No scripted provider is bound.

Chosen allowed fixture: `company-website` home. Its manifest explicitly states `home-has-no-frames` with iframe-count 0; booking embeds a frame on a different page. Spec asserts no iframe/frame after dismissing the real chat Close, Accept all cookie control and delayed Newsletter decline control. Runtime only captures the page. Compares pre/post body markup privately as a Boolean; no markup is printed. Each test has its own installed harness and cleanup.

## Flow shapes and assertions

Negative: canonical Constant(true), native registered `web.output.dom-capture_snapshot` A, canonical Branch B with condition wired from Constant, true back edge B→A and false→End. Native outputs are not wired into the condition or action. Asserts exactly two successful native A attempts, then one failed A attempt with `executor.runtime.unchanged_repeat`, nonretryable dispatch failure/effect unacted, empty outputs/effects, terminal graph cause, exactly two Branch attempts, and no repair overlay. No failed browser action is manufactured.

Positive: canonical Constant of seven identical string items → canonical For Each → the same native A → For Each, done→End. The item is deliberately unused by A; action parameters and page stay unchanged. Asserts seven successful A attempts, eight successful loop-head attempts, exact actual indices 0–6, successful End, no failure or repair. This proves finite iteration state, rather than incidental changing read outputs, preserves progress.

Both cases distinguish A from host-state captures. The local host gateway wrapper counts only real capture requests carrying the actual host's source metadata; total installed site commands minus those host captures must equal the exact native success count. Every sent site command must be a snapshot, every corresponding real gateway result succeeded, and there are no gateway errors. Distinct command count must equal total sent commands, proving fresh actual IDs without exposing IDs. Successful A attempts must carry distinct after-action capture refs, checked privately and never logged. No snapshot command is automatically counted as A.

The actual optional observer is wrapped observationally: calls the original method, returns its original answer unchanged, records only closed kind/reason counts and before/after counts. Asserts real observed answers for at least every successful A's before/after boundary, no unavailable answers for this eligible fixture/read, and zero extra site or host dispatches during observer callbacks. Does not synthesize, alter, or log equality tokens, target identities, page content, parameters, raw messages or receipts. Final console output contains closed test labels/status/counts only.

## Prerequisites and uncertainties

- Core source0.21 observer contract is the authoring target; installed SDK0.20 was pending the lead's rebuild when assigned. Host producer was concurrently implementing `observeRuntimeRepeat`. The spec intentionally fails a missing-observer prerequisite rather than substituting an answer. Typechecking/build/browser execution remain lead work after freezes.
- Need real browser confirmation that the dismissed company home yields complete, same-scope eligible captures and no later timed mutation; the producer may correctly abstain. Diagnose any abstention without weakening its evidence gates or fabricating equality.
- The approved closed distinct-command count uses only the existing private command map. Its equality assertion proves uniqueness across both host/native commands; no raw IDs or source messages are exposed.
- E2E compilation, imports against rebuilt SDK, canonical graph admission/routing, real native dispatch count, observer coverage, exact source metadata, private markup stability and cleanup are all unexecuted. The public trace assertions deliberately fail if real routing/host behavior differs; no successful result has been claimed.

Outcome: Done
Changed: Down apps/extension/e2e/site-reset/tests/runtime-repeat/tests/native.spec.ts; Down apps/extension/e2e/site-reset/installed-build.ts (approved closed counter only); this browser-proof.md report
Validation: not run (authoring-only brief prohibits checks/build/audit/browser/API/panel/provider execution); own source read back statically
Not verified: Typecheck, execution, browser behavior, runtime command-ID counter assertion, SDK rebuild and host producer eligibility
Report: C:/Users/osrs_/FluxStuff/fxwork/t829/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/browser-proof.md
Notes: Source frozen for lead execution after SDK/host freezes. No git, agents, env, runtime-data or shared-doc edits. Real observation is mandatory.
