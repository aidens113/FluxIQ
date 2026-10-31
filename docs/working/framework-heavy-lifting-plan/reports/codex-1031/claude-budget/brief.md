# Claude whole-build budget propagation

Role: Heavy worker; model gpt-6.1-sol; effort max.
Goal: Trace/fix why actual extension-chat creation ran with $0.25 although Lab declared/authorized $5.
Core root: C:/Users/osrs_/FluxStuff/fxwork/t836/!FluxIQ; Down root sibling !FluxIQWebExtension.
Owned (lead confirmed): packages/fluxiq/src/programs/automation-studio/runtime/service/flows/creation.ts, runtime/tests/service-flows/tests/creation-budget.test.ts, owning architecture doc paragraph, assigned worker.md. Expanded: runtime/service.ts exact createFlow delegation/import/field/constructor wiring; runtime/llm/flow-execution-limits/resolution-within-flow-settings.ts and its owning tests: use API shared bound, preserve explicit lower per-call limits. No other source edits.
Read: Core AGENTS Repository Boundary and docs/architecture/code-structure.md (typed fixtures/no as-never, barrel imports, one statement/line), relevant FHL Current State; Core model/run-cost-ceiling and actual chat/build creation budget callers; Down packages/test-runner/src/environment.ts, live-llm/cost-ceiling-env.ts, flow-settings.ts, run-scenario/chat-build/ as needed.
Evidence run: C:/Users/osrs_/FluxStuff/fxlab/t833-claude/lab-ext/test-runs/instances/t833-claude-company-website-slot-1/run-mvwvu6i3-28c1853c.
Safe evidence: summary.json firstFailure says actual Flow limit$0.25/spent$0.19; snapshots/live-llm.json declared ceiling5; central lab-runs/2026-10-31/run-mvwvu6i3-28c1853c steps meta6 successful Anthropic calls cost0.1912105. Never print prompt/page/key/token data.
User explicitly authorized Claude $5 whole build; CLI both cost flags5; env FLUXIQ_LLM_RUN_COST_CEILING_USD5. Default provider anthropic/model claude-sonnet-5-5. Lower explicit limits still hold; preserve normal product defaults/provider-free operation/no fallback.
Down buildFluxIQEnvironment appears to supply costCeiling and scope test correctly. Trace actual chat -> new Flow -> policy/run budget and retained creation purse before assuming environment failure.
Acceptance: meaningful provider-free regression through actual budget resolution/new-Flow path:5 remains5, explicit lower limits preserved, non-Lab defaults unchanged. Fail before spending if Lab config differs from actual Core build allowance.
Both Oct31 full-suite slots used: NO whole pnpm check/test/build or whole Vitest. No API/browser/server runs by worker. Wait for bootstrap before package commands.
Must not touch: git, version fields, shared working docs, pinned Lab, secrets, fixtures/oracles, prompts/guidance, unrelated policy/permissions.
Report: this directory/worker.md, short cause/fix/evidence/limits. End Outcome, Changed, Validation, Not verified, Report, Notes(max3lines).
