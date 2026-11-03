# Router owner and real observation entry

- Role: heavy worker, gpt-6.1-sol, max effort; existing stalled_build agent.
- Goal: preserve complete routing data and actual state-routing implementation under canonical owners, then design the smallest actual existing-kernel entry for ordinary and detached routing.
- Context: Current State of parent plan; model/flow-adaptation.ts routing/policy declarations; runtime/router-runtime.ts; runtime/route-state/router-state.ts; engine/automation/router; execution-admission/kernel register/prepare/invoke; runtime/flow-authoring/plan/route-condition; service.ts routing call and flow-bootstrap/verification/detached-execution.ts.
- Owned initially: complete routing/policy declarations in model/flow-adaptation.ts (surgical), runtime/router-runtime.ts, new focused flows/authoring/routing/** and adaptation-policy/** plus authoring barrel; your report only.
- Wait for Root transfer before editing runtime/route-state/router-state.ts; callback_guards currently owns it. Engine router/run.ts and ALL shared execution/clock/property helpers remain callback_guards-owned.
- You may read main service.ts and detached-execution.ts for entry design; do not edit either until Root accepts a concrete design and grants ownership.
- Keep full original fields/docs/literals/type relationships: five routing types, policy preset and full adaptation policy, four full router aliases. No reduced DTO, import of Studio even erased, copied authority, fake completion, new source, purity label or new callback registration API.
- Original files must re-export actual canonical symbols, not same-name alias declarations that cause root export-star ambiguity. Preserve original exports and all unrelated declarations.
- Move default-subflow projection only if cohesive dependency-complete owner is available; otherwise report exact blocker, do not broaden arbitrarily.
- Use narrow existing canonical route-condition parser, not broad bootstrap barrel. Actual state route implementation moves only after ownership transfer.
- Observation entry must use original bound graph options and existing register/prepare/invoke kernel semantics. RequiredCommandRun.execute/own only tracks a promise; it creates NO callback frame. Do not wrap commands twice or turn a missing frame into legacy fallback.
- First return precise proposed wrapper/call sites and dependencies to Root while working independent contract moves. Root will approve entry scope promptly.
- Acceptance: saved-original declaration/export parity; strict canonical source/type closure no programs; scoped structure; original routing behavior tests + actual observed frame negative/positive once source coherent. No package-wide readers while callback worker writes.
- Report: reports/router-owner-entry.md under this plan directory. Record commands/observed results, exact source/test manifest and held checks. No git/shared-doc edits/agents.
- Return: Outcome, Changed, Validation, Not verified, Report, Notes (at most three lines).
