# E-client read-account compatibility cleanup
Role: Standard worker gpt-6.1-sol medium; Down source only in t830.
Root: C:/Users/osrs_/FluxStuff/fxwork/t830/!FluxIQWebExtension.
Owned: domain/src/runtime/llm-evidence/node-run/shown-rows/account.ts; observed-state/{observed-state-keys.ts,read-rows-keys.ts} comments; existing node-run/tests/{shown-rows.test.ts,replay-read-account.test.ts} only if contract assertions need update.
Goal: remove obsolete model advice about future supersededBy replacements. Core now owns immutable historical references/current full-view tail/recall instructions; Down read account should state its actual kept/processed counts only, not re-teach generic Core cache/projection mechanics.
Read Core p9-append-only/a-implementation.md for context only; existing owned code/tests. Preserve all counts/qualifying-row data and full raw evidence; no sample/cap/ranking or request-schema behavior change. Do not replace old Core name with a new duplicated Core protocol instruction in client prose. Generic Core E handles model explanation.
Update comments to describe declared independent view groups generically, without claims that Core emits supersededBy. Remove now-unused local recall constant/import if applicable. Keep real existing assertions, update obsolete guidance expectations; no new tests mirroring a reversible text edit.
Must not touch Core source, tools.ts/frozen-execution/node-run algorithm, P10 examples, shared docs/version/baselines/generated output/git/secrets. No tests/builds/audits/browser/provider/panel or agents; all owning Source frozen until root combined Down acceptance.
Report Core p9-append-only/e-client-text.md (max30lines), freeze source before report. Standard return contract.
