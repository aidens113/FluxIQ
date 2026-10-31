# A acceptance corrections ? source frozen

- Five-tail assertion retained unchanged; now supplies one real recorded decision and one kept Flow draft step, so history/draft are intentionally present.
- Consolidated every append-only test into existing `llm/tests/context-window.test.ts`; deleted redundant `context-window-append-only.test.ts`, removing the 26th directory file.
- `decision-context/current-view.ts` imports recall's owning `evidence-recall/tool-id.ts` leaf under the cycle-avoidance import-rule exception.
- No production behavior or empty-history/draft semantics changed.
- Final owning selectors: `src/programs/automation-studio/runtime/llm/tests/context-window.test.ts src/programs/automation-studio/runtime/llm/decision-context/tests/view-groups.test.ts`.
- Earlier report's separate append-only selector is superseded by the consolidated selector above.

Outcome: Done
Changed: llm/decision-context/current-view.ts; llm/tests/context-window.test.ts; removed llm/tests/context-window-append-only.test.ts; this report
Validation: not run ? correction brief prohibits checks/builds/audits; lead reruns acceptance
Not verified: corrected owning tests, types, structure audit
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/a-corrections.md
Notes: Source frozen. All meaningful projection oracles retained. No B/C/shared/version/baseline edits.
