Role: Heavy discovery worker; gpt-6.1-sol, max.
Goal: Trace incorrect per-row read/filter in failed Claude run to exact product cause and smallest general fix. Read-only source; do not fix yet.
Owned: only report field-read-discovery.md beside this brief.
Must not touch: source/shared docs/git/builds/run artifacts/other reports. No paid/browser calls/full suites.
Context: first Current State paragraph of docs/working/framework-heavy-lifting-plan.md.
Source: C:/Users/osrs_/FluxStuff/!FluxIQWebExtension current dev (same as t838 sourcebase).
Run: C:/Users/osrs_/FluxStuff/lab-runs/2026-10-31/run-mvx1t6il-3d751ec6/steps
Final bundle: C:/Users/osrs_/FluxStuff/fxlab/t833-claude/lab-ext/test-runs/instances/t833-claude-company-website-slot-1/run-mvx1t6il-3d751ec6
Final trial0055 readRows has7rows. Judge correctly identifies missing eighth row. That row's page text offset+4 was measured for second filter; required badge at+6, identifier number+7. Wrong earlier text read.
Find actual authored node/where selector/binding, matched DOM and field evidence, whether model authored broad first-match selector or product misbound a correct read. Inspect initial detection/extract outputs if needed.
Relevant code likely Domain per-row predicate/field reads and Extension row-relative read matching; follow only implicated paths.
Task/oracle unchanged; static company-website/live-tasks.ts and manifest.ts can be read for intended semantics. No fixture-specific product guidance.
Return whether actual output projects4requiredcolumns or only diagnosticname; do not infer from readRows.rows alone.
Inspect artifacts privately. Never print raw model/page/recorded content, selectors, fixture row values, credentials or tokens. Report general shape/count/closedcode and source path/line only.
Core judging/refutation/finish-budget trace belongs to live_judge_discovery; do not duplicate it.
Acceptance: precise root-cause with actual artifact proof, file ownership proposal, narrow regression commands. No browser/provider/fullsuite runs.
Report at most90lines; return Outcome;Changed;Validation;Not verified;Report;Notes(max3lines).
