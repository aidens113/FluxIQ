# E-client read-account compatibility ? source frozen

- Down read account now says only `extracted holds all N kept row(s)` and, when present, that rejectedRows holds the rows the conditions turned down.
- Removed obsolete future-successor/recall advice and the unused duplicated local recall-tool constant.
- Declaration comments describe independent top-level/held groups and Core's ownership of context projection; no duplicated new protocol instructions.
- Existing shown-rows guidance assertion now checks the exact count-only sentence; all row/count/data assertions remain.
- Raw rows, count fields, firstRows, qualifying/rejected data, algorithms and request schemas unchanged. replay-read-account.test.ts needed no edit.

Outcome: Done
Changed: Down domain/src/runtime/llm-evidence/node-run/shown-rows/account.ts; observed-state/observed-state-keys.ts; observed-state/read-rows-keys.ts; node-run/tests/shown-rows.test.ts; this Core report
Validation: not run ? brief prohibits checks/builds/audits; lead runs combined Down acceptance
Not verified: owning tests, types, structure audit or live behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/e-client-text.md
Notes: Source frozen before report. No Core source/tool/P10/shared/version/baseline edits.
