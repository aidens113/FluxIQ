Role: heavy implementation worker; model gpt-6.1-sol; effort max.
Goal: fix preserved-input action ambiguity by honoring recorded landmark as a semantic place constraint, without lowering confidence or weakening safety.
Root: C:/Users/osrs_/FluxStuff/fxwork/t837/!FluxIQWebExtension; branch task/t837-completion-parameter-ambiguity.
Context: engine/command discovery reports; current working state. Actual failed command retains full original fingerprint/navigation landmark byte-identically; restyled header/footer score0.89/0.88, margin0.01<0.20.
Owned source: apps/extension/src/content/identity/{place.ts(new),index.ts,score.ts,veto.ts}; content/action-runtime/{resolve-target.ts,read-lookup/in-recorded-landmark.ts}.
Owned tests: identity/tests/{place.test.ts(new),score.test.ts,veto.test.ts}; action-runtime/tests/resolve-target-landmark.test.ts(new).
Owned report: this directory/fingerprint-engine-fix.md.
Must not touch: failure/recovery code or tests, Domain/Core source, browser spec/observer, shared docs, git, other reports.
Implement one coherent shared record/dialog/landmark place predicate. Require recorded landmark role/name when present; absent original landmark imposes no invented restriction. Apply before exact multi-match counts/veto, Level2 scoring/ranking/candidate cap and stable-name rescue. Reuse for read landmark filtering; preserve existing read semantics.
Keep scoring weights/floors/margins, frame/shadow/document/record/dialog boundaries and original complete fingerprint unchanged. No guessed matches or global fallback to different landmark; no baseline growth.
Regressions: ID+class drift chooses exact navigation link over footer twin; missing original landmark refuses footer; same-landmark twin remains ambiguous; wrong/missing recorded landmark/name fails closed; existing record/dialog/frame/shadow negatives stay valid; candidate cap does not pre-empt place filtering.
Run narrow owning unit files after source writes stabilize; NO package compiler/build/browser/full suites (lead owns them). Other worker owns recovery/failure modules independently, coordinate no shared paths.
Inform root BEFORE source edit and when frozen. Plain structure audit may run only after other worker source also frozen; root owns final audit/types/build/installed proof.
Write concise report with exact commands/results and normal return contract; no raw page/model/selector/key data.
