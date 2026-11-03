# Review actual recording scope composition
Role: Heavy reviewer, gpt-6.1-sol Max; READ ONLY source; no agents/git/shared docs.
Repo: t843 Core. Root implementation is SAVED/static; do not run compiler/runtime/audit/build/provider/browser commands.
Own report ONLY reports/recording-scope-composition-review.md <=80lines.
Review Root policies/{trusted-domain,domain-ingress,start-context,start}.ts and their two immediate tests; decoding/opaque-target.ts.
Review Studio client-gateway/{bridge,start-policy}.ts and gateway recording lifecycle/{start,client/open}.ts. Existing legacy context tests establish callback receiver/request and host precedence contracts.
Review Service.ts ONLY readonly recordingIngress field, createRecording, appendRecordingEvents; new runtime/tests/recording-domain.test.ts. Your captured-address implementation and B's pinned registry/policy are stable context.
Trace actual trust from gateway snapshot server-owned view (active trust domain nullable; missing legacy domain refuses), project domain through original assertProjectDomainAccess, and pending provider/flush/create/revocation/Stop/reconnect boundaries.
Verify one domain persists/active ref uses returned ORIGINAL recording, no request/metadata/environment override, original callback receiver/tuple unchanged, no extra address/rights registry.
Check raw entry/result/evidence/domain validation before normalizer/mirror/stream/index writes and atomic batch rejection; direct Service/HTTP bypass vs gateway path; null passive scope cannot choose foreign projector.
Distinguish concrete source bugs/compatibility regressions from unavailable runtime evidence. Check whether opaque fallback silently narrows original accepted domain values or loses browser validation in actual registered required-domain paths.
Do not infer a fake snapshot test port is an external security boundary; actual bridge receives the trusted gateway service. Do not propose blanket purity/completion declarations or a second scope store.
Report actionable findings with exact path/line, cause, failing path and narrow proof needed; no speculative checklist. If no source finding, state which real async/race/integration cases remain unverified.
All source edits belong Root; do not fix findings yourself. SQL foundation implementation remains held.
Standard return contract; no shared Current State/Ledger edits.
