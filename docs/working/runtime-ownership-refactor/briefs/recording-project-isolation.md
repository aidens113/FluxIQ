# Recording project isolation
Role: Heavy worker; gpt-6.1-sol, Max. No git, agents, or shared document edits.
Goal: Fix actual recording cache/controller project isolation exposed by R5 capture tests.
Repository: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ.
Read: Current State of docs/working/runtime-ownership-refactor.md; your existing Core boundary instructions.
Owned: programs/automation-studio/runtime/service/recordings/** (except proposal-candidates fixture), narrowly necessary recording-controller cache/address implementation and adjacent tests.
Lead release: exact service.ts createRecording method plus focused lock/store helper for atomic memory-only cross-project ID collision refusal; no other service.ts edits.
Subsequent release after first package build ended: exact service.ts listRecordingSessions/deleteRecording and existing recordings/deletion.ts plus adjacent tests. Close scoped list/bulk/single delete leaks without global-slot races or baseline growth; preserve same-ID decoy data.
Mirror serialization release: exact appendRecordingEvents/finalizeRecording final put calls may delegate to the sole original-repository mirror writer; lock scoped check/delete with all actual mirror puts. No second read cache or second repository authority.
Normalized address release: normalizeRecording project metadata must be stamped without an objectStore condition; exact listProjectNormalizedTimelines/getProjectNormalizedTimeline may delegate to cohesive scoped owner. Never trust a foreign/ownerless global normalized slot as project evidence; legacy project file/index may establish data ownership. Preserve ambiguous ownerless mirrors during scoped deletion.
Bulk lock integration: exact service.ts deleteRecordings may supply the existing project recording mutation lock callback to its collaborator; deterministic ID lock order, all address validation before mutation, no nested reacquisition. Single deletion preserves original private pipeline callback/receiver.
Pipeline/summary closure: exact writeRecordingPipelineNormalizedTimeline/writeRecordingPipelineArtifact global recording reads may use actual scoped loader, preserving missing/error distinction. listRecordingSummaries must use scoped loader and composite project/recording seen keys, with same-ID all-project summary regression.
Compatibility amendment: preserve valid original cached prepared/inline bodies and omitted-time retry identity. Sole writer may retain last-publication owner by original repo/id (no document/read cache), checked with current metadata/requested address. Trusted direct legacy bodies retain matching-project behavior absent contradictory publication ownership; no execution rights derive from cache provenance. Do not impose hostile private-repository-write invariants or weaken original restart oracles.
Source paths are below packages/fluxiq/src/.
Must not touch: runtime/service/recording-sink/**, client-gateway/recording/**, runtime/recording/**, IO bridge, candidate/reentry/admission source, package barrels, shared docs.
Trace actual get/write/controller ownership, not just read cache. Same recording ID in two projects must never expose/append/stop another project's recording.
Preserve compatibility of unscoped legitimate APIs; use actual project ownership or explicit collision refusal where global IDs are a genuine contract. Do not paper over writes with a stale extra read cache.
Coordinate actual failing selectors with web_matcher_ownership. Do not weaken or skip assertions.
Run narrow store/controller tests plus actual two-project capture regressions when coordinated.
Report: docs/working/runtime-ownership-refactor/reports/recording-project-isolation.md.
Return Outcome, Changed, Validation command/results, Not verified, Report, Notes <=3 lines.
