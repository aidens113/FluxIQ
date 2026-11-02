# R3 registered output dispatch and execution integration

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Move real IO/runtime transport and generic graph option assembly out of Studio behind bounded target preparation.
Read: Current State of ../../runtime-ownership-refactor.md; reports/native-io-plan.md R3; stable runtime/output-dispatch/{action,target-preparation,target-preparer,index}.ts.
Repository: current t843 Core worktree only. Begin after lead accepts R1 source handoff.
Owned: Studio runtime/io-policy.ts and new output-target/** adapter; runtime/output-dispatch/** implementations/tests (stable contracts require lead agreement before changes); runtime/execution-integration/**; Studio service/runtime-session/graph-options.ts exact adapter; corresponding focused tests.
Must not touch: SDK/native/adapters except necessary same-worker R1 follow-up after notice; environment/control/resources/composites/state/recording/model/flow-adaptation, public package exports/root barrels, _shared/runtime.ts, audit configs/shared docs/indexes/other reports.
Stable preparer is synchronous and receives action, domainId and registered DomainOutputDefinition only. No IO/runtime/handler/dispatch capability is supplied.
Success may replace PARAMETERS ONLY, with optional diagnostics/resolution; it cannot replace outputId/actionType/confirmation/authority. Keep cached verified output identity and original confirmation fields. Canonical transport merges diagnostics under existing key and compacts metadata exactly as before.
Absent preparer passes opaque data through unchanged after registered-output checks; no silent browser/legacy target inference in canonical transport. Studio old signatures always bind exact legacy preparation.
Keep legacy target normalization/rewrite in explicit Studio adapter until R8 trusted domain port migration; no active web aliases copied into runtime.
Extract real neutral matcher/confidence helpers. Keep no-candidates and no-matcher distinct, exact safety floors/override clamp, scores/failure codes/status/privacy. Only explicit domain matcher selects.
Preserve confirmation-before-dispatch timing, runtime capability fallback, double preparation/order where existing behavior relies on it, cancellation/deadline/reference time, command context, preferred client/session, withheld values/results, route lifting, actionability, clearedWait and unknown-act conservatism.
IO root uses neutral runtime failure/actionability types already (lead-owned change); avoid runtime parent-barrel cycles.
Graph option assembly waits until R2 source handoff/ports stable. Runtime foundational owners cannot import engine; put actual engine option assembly under engine/automation/integration if its types/behavior require engine ownership, rather than violating runtime->engine direction. Confirm this placement with lead first.
Studio supplies legacy envelope classifier/target preparer; canonical options preserve ORIGINAL host receiver/object identity, dynamic action floors/refresh, authorized bound-domain grant and exact capability order.
One exported thing/file, cohesive directories/barrels, no baseline increases/remaps. Move pure tests to owners, retain Studio integration tests/oracles.
No package-wide check/build during peers' edits, full suites, providers, git mutations or spawning.
Acceptance: direct IO/runtime dispatch/confirmation/fallback/matcher/no-matcher/identity tests and retained graph/native integration tests at source freeze.
Report: docs/working/runtime-ownership-refactor/reports/output-dispatch.md.
Return: Outcome; Changed; Validation exact commands/results; Not verified; Report; Notes <=3 lines.
