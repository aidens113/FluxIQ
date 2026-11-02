# Recording mapper, review and recipe ownership

Role: Heavy worker; model gpt-6.1-sol; effort max. No agents or mutating git.
Goal: execute mapper/review lane C in reports/recording-extensions-plan.md, actual algorithms not wrappers.
Read Current State in ../../runtime-ownership-refactor.md; named report sections mapping, stable types and acceptance.
Stable SDK authorities now exist: recording-mapper/{normalized-candidate,evidence-reference,binding,parameter-normalizer}.ts.
Old RecordingFlowActionCandidate/RecordingMapperBinding alias these single authorities; do not recreate them.
Trusted bundle hook is recordingCandidateParameterNormalizer; bound mapper exposes normalizeParameters.
Canonical absence shallow-copies parameters; no browser fallback or inference from target fields.
Own new runtime/recording/mapping/**, flows/executable/recording/**, components/automation/recording/**.
Own old runtime/recording-flow-proposal.ts and service/recordings/{proposal-generation,proposal-candidates,timeline,
normalization-review,candidate-definitions,types}.ts, recording-projections/mapper-candidate.ts and immediate tests.
Own feature barrels inside these paths; root/package/service.ts/shared docs remain lead-owned.
Native runtime file is LOCKED by producer worker: do not edit it until explicit lead release.
Prepare exact normalizer register/list/get slice; report it, implement only after that file releases.
Do not touch engine/native execution/IO/output, SQL/indexing, permission or trial/LLM/cache files.
Use canonical recording/state/index/SDK contracts and the exact observation-policy distinctions in the report.
Keep project/review identity, timestamps, persistence envelopes and artifact selection Studio.
Move actual mapper iteration/candidate validation/gap/state link/review/recipe/definition implementations.
Preserve original callback receivers, fields, ordering, gap timings and public legacy behavior through adapters.
No broad Service Picks, duplicate registries, fake DTOs, source baseline increases or extract-and-drop.
Root owns SDK stable DTO/bundle hook declarations; request any needed shared change before editing.
Normalizer registration must pin original function and original bundle receiver, reject domain conflict BEFORE partial registration.
Manifest metadata cannot install executable functions. Missing normalizer never silently invokes browser normalization.
Retain original real-SQL proposal-candidates integration oracles and other report named tests.
Add canonical injected-port tests, exact parameter bytes, normalizer missing/conflict/no-manifest authority checks.
Run only focused owned tests, strict/erased-import closure and scoped structure; no package/full suites/build/provider/browser/panel.
Report reports/recording-mapping.md with exact source/barrel/export handoff and dependency still locked.
Freeze at handoff; final return: Outcome, Changed, Validation, Not verified, Report, Notes(max3lines).
