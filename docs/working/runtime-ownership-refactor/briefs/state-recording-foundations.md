# R5 state and recording foundations

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Canonicalize rich shared state/recording contracts and move actual store/diff/signals/session/domain/controller/normalizer implementations.
Repository: paired Core checkout named by lead dispatch, not old t842 path.
Read: Current State of ../../runtime-ownership-refactor.md; reports/state-recording-plan.md groups1/2; Core boundary/code-structure rules.
Owned: packages/contracts/src/{state,recording,evidence,runtime/actions,targets}/** and new state.ts/recording.ts; exact duplicated DTO slices in contracts/automation-studio.ts; Studio model/{state,state-store,state-diff,signals,signal-registry,conditions,actions,recordings,timeline,recording-domain,recording-framework,descriptors,evidence,node-state,action-element-target}.ts only specified passive/executable slices; model/validation/{state,recording,visual-target}.ts; Studio normalization/** and runtime/recording-controller.ts; new runtime/{state,recording} foundation owners; focused tests.
Must not touch: SDK/importer/native/adapters, engine/flows execution code, model/composites.ts or flow-adaptation.ts, gateway/IO/index/mapper implementation (later groups), package exports/root barrels, _shared/runtime.ts, audit configs, shared docs/indexes, other reports.
Lead owns public package exports, parent integration and mechanical import retargets. Notify lead of exact new export authorities before dependencies need compilation.
One canonical rich contract declaration; preserve existing shared JsonObject evidence/signals specializations AND Core rich-reference/signal types through explicit generic aliases; do not silently narrow either.
Preserve all schema/enum strings, fields, optional/undefined/null handling, unknown values, timestamps/IDs/sequence, descriptions, confirmation metadata and presentation fields.
Canonical validators take explicit content-ref acceptance policy; legacy Studio wrapper binds exact existing allowlist/messages. No program URL schemes hardcoded in framework.
Normalizer payload-state heuristic only explicit compatibility policy bound by old Studio caller. No hidden domain assumption.
Leave project/view/learned evidence envelopes and initial editor phases Studio. Passive target DTOs remain opaque; no browser normalization copied into Core.
Do not redeclare browser-only keys (selector/xpath/tagName/url/classNames/etc.) in new canonical contracts or move their baseline exceptions. Use generic opaque target/fingerprint parameters on canonical action/entry/session contracts; preserve exact legacy browser-shaped specializations at their existing compatibility leaves. Neutral algorithms carry those objects without interpreting them. Report this cut before coding if compatibility needs additional ports.
No canonical -> Studio dependencies, including types; no duplicated parallel stores. One exported thing/file, feature barrels, budgets, no baseline increases/remaps.
Move pure tests beside new owners; preserve fixture/artifact integration Studio. Add direct controller lifecycle coverage and rich/shared type/roundtrip compatibility checks.
Acceptance: groups1/2 focused tests, identical normalization/diff/store/session output and old public compatibility; report direct commands/results.
No package-wide check/build during concurrent editing, full suites/provider calls/git mutations/spawning.
Freeze contracts and report exact authorities before continuing implementation; freeze whole group before lead integration.
Report: docs/working/runtime-ownership-refactor/reports/state-recording-foundations.md.
Return: Outcome; Changed; Validation exact commands/results; Not verified; Report; Notes <=3 lines.
