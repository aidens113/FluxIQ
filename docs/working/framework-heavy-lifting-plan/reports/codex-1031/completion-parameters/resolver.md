# Completion parameter source recovery

Outcome: Done (bounded downstream implementation; lead qualification remains).

The five real completion refusals all name `plan.subflows.0.nodes.3.parameters`, with `web.handle.ambiguous` and `web.handle.ambiguous:parameters`, at draft revisions 7, 11, 15, 19 and 21. Read-only access to the closed run's retained draft and the actual public assembler prove that node is `web.output.dom-click`, from retained step 3. Optional routing inserted a merge before it. Its target was originally supplied by handle and retained as the host's resolved selector and whole fingerprint. Columns, dotted keys and extraction are not the cause.

The closed run's project trace database was copied into ignored diagnostic storage, including present WAL/SHM, without opening or mutating the original database. Its relevant unencrypted trace chunks were length/hash checked before parsing. No key, auth, identity or profile values were read. All 59 recorded raw snapshots match that exact original selector and complete fingerprint, including class and landmark: exactly one such address per capture, zero shared-address captures, ten distinct document/location source keys, all classified `navigate`. This rules out duplicated current controls and a shared CSS-address flag for this refusal. The absolute lookup discarded the original act's private source and then treated matching later observations as competing origins.

The fix allows an unscoped host completion or historical lookup to distinguish these observations only when exactly one actual immutable `flow.acted` pre-act source matches the complete target. It retains the original selector, full fingerprint, frame, shadow context and private captured document/layer source. Another acted source, any shared address or any retained intent conflict still refuses. Every competing observed annotation must agree with the recorded source. Model-authored literals/source hints remain refused before this lookup. A live `onPage` lookup receives no pre-act fallback, so it cannot borrow an older page or document's annotation. Parameters, persistence and public Core contracts do not change; annotation supplies no permission, effect or retry authority.

Changed:

- Down `domain/src/runtime/llm-evidence/plan-resolution/control-intents/absolute.ts`
- Down `domain/src/runtime/llm-evidence/plan-resolution/target-packets.ts`
- Down `domain/src/runtime/llm-evidence/plan-resolution/control-intents/tests/resolution.test.ts`
- Down `domain/src/runtime/llm-evidence/tests/control-intent/tests/lineage.test.ts`
- Down `docs/architecture/control-intent.md`
- This report only on the Core side; no Core source/shared document/git changes by this worker.

Validation:

- `pnpm.cmd --filter @fluxiq-web-extension/domain build` before independent Core edits -> existing current source restored from the shared build store, exit 0; no rebuild was needed.
- `node test-runs/t837-completion-probe/assemble-probe.mjs` -> actual public assembler accepted the exact retained five-step draft with zero issues and proved the offending node definition/path above.
- `node test-runs/t837-completion-probe/capture-diagnosis.mjs` -> 59 exact full-identity matches, ten captured source keys, zero shared-address captures; raw material remains ignored.
- `node test-runs/t837-completion-probe/trace-runtime-probe.mjs` against the original compiled Domain -> actual original navigation/two clicks replayed their recorded replies; public completion refused `flow_bootstrap.evidence_completion_parameters_unresolved` / `web.handle.ambiguous:parameters`, exit 0. Scoped original-page resolution already succeeded. `trace-before.log` retains only safe codes/counts.
- The same probe using the ignored current-source diagnostic bundle through `T837_DOMAIN_PROBE_MODULE` -> historical and unscoped host resolution return `navigate`, actual public Core completion succeeds, exit 0. It returns all 59 recorded snapshots through the original three action replies and 57 capture callbacks; no real gateway or provider calls. `trace-after.log` retains only safe codes/counts.
- `pnpm.cmd --filter @fluxiq-web-extension/domain test /plan-resolution/control-intents/tests/` (label `t837-resolver-initial`) -> 18/18 pass, 412.3061 ms.
- The later package test attempt stopped at Core's currency guard after independent Core source edits, before running any tests. No guard/stamp was overridden. Per lead direction, subsequent local source feedback used the existing compatible SDK 0.25.3 via the named domain runner, pending the lead's final SDK 0.25.4 build.
- `node scripts/test-domain.mjs /plan-resolution/tests/ /control-intents/tests/ /tests/control-intent/tests/` (label `t837-resolver-final`) -> 219/219 pass, 8722.1725 ms. The private log is `test-runs/t837-completion-probe/owning-tests.log`.
- After adding the final whole-fingerprint/frame/shadow witness-mismatch negative: `node scripts/test-domain.mjs /control-intents/tests/ /tests/control-intent/tests/` -> 25/25 pass, 536.7447 ms. The unchanged resolver cases above plus this final added case total 220 owning cases. The private log is `test-runs/t837-completion-probe/final-intent-tests.log`.

The new public regression runs the actual web binding/permission seam, public Core completion and actual Native executable. Duplicated labels remain distinguished by their full target. The completed node and its emitted executable action retain the entire original fingerprint, and no semantic annotation enters the saved graph. Two actual pre-act sources for the same absolute target still refuse. Existing accepting-control, historical conflict, reused handle, frame/shadow, wrong-page, forged annotation and permission negatives remain passing. The final added cases prove that another full identity, frame or shadow scope cannot serve as a pre-act witness.

Not verified: final rebuilt SDK package currency/type/structure gates; actual browser fingerprint reacquisition after new-document navigation/reload and changed weak attributes; a finished judged Flow/oracle/replay. The lead owns those acceptance checks. No paid, browser or server run was launched by this worker. The Native regression proves executable fingerprint transport, not the browser's DOM selection.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/resolver.md`

Notes: Source frozen for lead integration. The target-packets module has no line-budget growth; no baseline change. All raw draft, trace database and command/snapshot evidence stays in ignored diagnostic storage.

## Strict fixture correction and explicit model-origin proof

The lead's final Domain typecheck rejected only the new `lineage.test.ts`: its completion call omitted the required discriminant `origin: "model"`; it treated optional draft/plan fields and generic JSON effect payloads as already narrowed. The JavaScript runner had exercised the two tests, but that did not validate their strict TypeScript shapes. The correction is test-only: an explicitly typed kept-step builder asserts the actual returned action ID, input, resolved call and effect; assertions narrow the actual plan parameters and emitted JSON payload. Both completion calls now explicitly take the model-origin branch. No casts, contract relaxation or runtime source changes were used.

- `pnpm.cmd --filter @fluxiq-web-extension/domain test /tests/control-intent/tests/lineage.test.ts` (label `t837-resolver-types-correction`) -> current Core currency guard passed; 2/2 tests passed, 94.5254 ms.
- `node test-runs/t837-completion-probe/trace-runtime-probe.mjs` -> actual production SDK `0.25.4` and production Domain build, explicitly `origin: "model"`, completion `ok: true`, original `navigate` annotation retained, 57 capture callbacks/three recorded action replies covering the 59 recorded snapshots, zero real gateway/provider calls. Safe output: `test-runs/t837-completion-probe/trace-after-model-origin.log`.

The previous probe omitted `origin`; its earlier output is retained as diagnostic history and is superseded by this explicit model-origin API proof. The lead will rerun final Domain strict types and owning tests. Runtime source remains frozen.
