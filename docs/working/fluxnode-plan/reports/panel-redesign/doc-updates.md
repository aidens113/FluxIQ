# P9-DOC: authored docs brought in line with the redone panel

## Outcome
Done. Documentation only.

## What changed and why
- **PIN statements.** `automation-studio/persistence.md`: the section is now "Which endpoints need a confirmation" (anchor `#which-endpoints-need-a-confirmation`). It describes the press grant (one use, 60 s, bound to session, person, endpoint and exact payload; minted only by the person's press via `identity-access/mint-press-grant`, or for the assistant by their own clear words or a press of Allow), that a person with a PIN still gives it, and the 2026-11-03 rule. The classification table, the caller paragraph, the autosave rationale, the "Declared gaps" paragraph and the cold-process paragraph were updated. `package-boundaries.md`: a new "Next minor" entry for the press grant; the older "call() now asks for the PIN" bullet says it is the history of how it shipped. `framework-reference.md` is generated, so I ran `pnpm docs:reference` (JSDoc in `api.ts` was already updated by F1); it no longer says "session PIN". It also wrote `packages/fluxiq/docs/reference/framework-reference.md` and picked up other API drift (716 -> 793 declarations), not only my change.
- **Retired operations docs.** `docs/README.md` lists all three as live docs, not history, so per the brief's "else delete" I deleted `web-panel-phase8-browser-scale-certification.md`, `web-panel-responsive-visual-certification.md` and `automation-studio-ui-performance-profiling.md`, and fixed every link to them (`docs/README.md`, `programs/global-programs.md`, `operations/automation-studio-scale-certification.md` (link and evidence list), `architecture/automation-studio/workspace.md`, `apps/web/e2e/README.md`). Replacement text says the runbook was retired with the old workspace; `surface-matrix.spec.ts` still exists and is named in global-programs.md.
- `architecture/automation-studio/workspace.md`: "Retired" banner at the top naming the new panel routes; chat section kept as current; dock route text fixed.
- `architecture/code-structure.md`: `ProgramLauncher` removed from the shell list.
- `architecture/program-layout.md`: launcher section replaced with a retired note and the new routes. `architecture/current-system.md`: `/domains/:domainId` workspace replaced with the new routes. `architecture/automation-studio.md`: chat now "assistant dock", not the deleted route.
- `packages/ui-components/README.md`: chat route replaced by the assistant dock. `apps/web/e2e/README.md`: phase 7/8 text removed; "Panel specs" and "Chat widget" untouched.

## Commands run and observed results
- `node scripts/structure-audit.mjs --rule docs-links` -> `structure-audit: passed (0 warning(s), 0 baselined).`
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (524 warning(s), 969 baselined).`
- `pnpm docs:reference` -> `Wrote docs/reference/framework-reference.md and packages/fluxiq/docs/reference/framework-reference.md (793 public declarations).`
- rg for `programs/automation-studio/chat`, `ProgramLauncher`, `phase8-`, `phase7`, `get-started`, `GlobalConversationPrompt`, `performance-baseline`, `ui-performance-profiling` over docs (not working) and READMEs: remaining hits are only the "was deleted/retired" notes (ui-components README, scale-certification, current-system, program-layout) and one workspace.md line saying the old route was deleted. No live links or claims remain.
- rg "PIN": remaining mentions are correct: login/credential rechecks and Secret Keys (global-programs, data-and-state, platform, ui-theme, migration-plan, llm-flow-bootstrap), the PIN-on-a-reset rules, `answer-ask` panel-command PIN (client-gateway, package-boundaries), ui-components `asks` PIN dialog (still a real port), and the press-grant text itself.

## Not verified
- Not stale-checked but possibly outdated PIN claims outside the brief's scope: `automation-studio/client-gateway.md` lines ~916 and ~931 ("PIN-authorized operator revoke access"; revoke is `authoring` now), `automation-studio.md` ~1071 and ~2796 (PIN-authorized migration/recheck). I left them; they concern other flows, and I did not trace each.
- Other pre-existing mentions of the old Studio shell inside workspace.md's retired body were kept as history, by the banner.
- `git status` also shows `.structure-baseline.json` and two package.json files modified; not by me.

## Open questions
- None blocking. If the lead prefers the three deleted ops docs kept as history, they are in git history of this branch.
