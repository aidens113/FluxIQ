# P9 A: immutable evidence projection
Role: Standard worker gpt-6.1-sol medium.
Core root: C:/Users/osrs_/FluxStuff/fxwork/t830/!FluxIQ
Source gate: READ ONLY until lead explicitly says SETUP COMPLETE; initial SDK build is active. Then implement owned source and freeze before report.
Read: FHL Current State; reports/codex-1031/p8-repeat-history/p9-executable-design.md relevant unit/contracts only; code-structure architecture when creating files.
No shared Current State/ledger, git, version/baseline, generated output, secrets, browser/panel/provider/API calls or agents.
No checks/builds/audits: lead will run combined owning acceptance after all source writers freeze. Full suites twice/day already used; future paid Claude/$5 requires GO.
Goal: implement design A/contracts1-3: historical view projection immutable from first appearance, plus one dynamic full current-view tail.
Owned relative to packages/fluxiq/src/programs/automation-studio/runtime/: llm/context-window.ts; llm/decision-context/{current-view.ts,index.ts,shown.ts,view-groups.ts}; new cohesive current-view helpers if needed; llm/tests/context-window.test.ts and new context-window-append-only.test.ts; llm/decision-context/tests/view-groups.test.ts.
Must not touch: route-state/, node-tools/, evidence-loop.ts, evidence-loop-decision.ts, provider/schema/request-prefix tests, Down source; all other paths require approval.
Keep every non-view field of every evidence entry whole and in original order. Replace declared view members immediately with a stable reference to their ORIGINAL call/group, never a future replacement. Preserve original raw evidence for recall/execution.
Append core.current_view after immutable history and before existing current_flow/history/draft/budget tails; contain latest whole members of every declared top-level/holder group exactly once with source call identity. Page-only updates keep last read rows; no caps/ranking/sampling/summaries.
Preserve Core recall's separate restored view behavior; preserve all accepted/refused current-Flow semantics. No declared view keys means existing whole evidence, no invented client view.
Choose/document exact reference and tail shape; retain old exported superseded-key symbol compatibly if still public, but do not pretend its future-reference semantics establish prefix stability. Lead will wire matching generic/downstream wording in E.
Tests must prove first result already projected, replacing/adding views leaves all historical UTF-8 bytes unchanged, every latest page/row once, interleaving/empty/missing groups, recall, current Flow, no input mutation and no undeclared data loss. Existing stronger oracles stay; update obsolete successor-reference expectations explicitly.
Reuse existing view-group reader; no copied serializer/digester or domain names/examples. Follow barrels, one statement per line, cohesive file budgets.
Report: this directory/a-implementation.md, max60lines, exact shape and ownership changes; standard return contract. Source claims only, no test success claimed.
