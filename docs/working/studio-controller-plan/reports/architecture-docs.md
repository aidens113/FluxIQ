# Report: architecture-docs

## Outcome

Done, with two source defects found in the extension that I was not allowed to fix (below). Authored architecture documents in both worktrees now describe Automation Studio as a thin controller of the framework. The three acceptance checks pass.

## What changed and why

Core (`docs/architecture`, README, `packages/ui-components/README.md`, reference):

- `code-structure.md`: the history-based "gap this closes" section is now "What these rules decide" and says backend never lives in a program. Ownership table gains rows for controller-program contents, where a program's backend goes, and the chat package. Layer table is labelled for controller programs. Capability-area sentence names `framework/automation-service/nodes` and `flows/authoring/dsl`. Public-surface bullet, test-location example, browser-import example and the persistence worked example describe the current tree with no "before" state.
- `runtime-ownership.md`: owner table adds the framework areas Studio's backend now lives in (including the top-level `runtime/llm`, `conversations`, `automation-activity`, `automation-parking`, `action-permission-requests`, `loop-limits`, and `result-verification/check-*`). New "Studio is a controller" section (four things it holds, `program-controllers` rule, 20-line budget described as an audit threshold, `importBoundaries`). "Public entries" section lists `fluxiq/automation` + subpaths, `fluxiq/automation-studio`, `/dsl` and `@fluxiq/contracts/automation`. Web boundary now documents the hooks on the implementation bundle and the five residual browser-field readers by path. Distribution states current versions.
- `README.md` (architecture): intro bullets, area table rows and a note that nothing imports a program and the chat is a separate package.
- `package-boundaries.md`: four packages, a `@fluxiq/ui-components` row, an automation-entries table, current versions, and a "Moved" line on the element-target migration note.
- `automation-studio.md`: intro, "Folder Ownership" rewritten as controller plus a capability-to-location table, pipeline-contract bullets point at their real directories.
- `program-layout.md`: new "Controller Programs" section with the exact shape and the rule; boundaries line updated.
- `automation-studio/workspace.md`: new "The Chat UI" section (ports, two clients, `/programs/automation-studio/chat`, Core's own conversation UI unchanged).
- `automation-studio/failure-control.md` and `llm-flow-bootstrap.md`: the `ownRetestBound` lines from dev-failures.md.
- `current-system.md`, root `README.md` (new "Automation Studio" section, `ui-components` in the repository shape), `packages/ui-components/README.md` ("Clients" section).
- Mechanical path repair: 271 backticked code paths in the architecture documents that named the old Studio tree were remapped, using git's rename detection against `ff8eb0be8` plus the forwarding modules that were deleted (read from `ff8eb0be8`). A second pass expanded short-form paths (`llm/...`, `service/...`) to full paths under `packages/fluxiq/src/`. `automation-studio/flow-authoring.md` now states that paths are relative to `packages/fluxiq/src/`.
- `docs/reference/framework-reference.md` and its package copy regenerated with `pnpm docs:reference` (716 declarations). It needed no build.

Extension (`docs/architecture`, README):

- `repository-layout.md`: Core's four libraries (the chat package added) for worktree builds, the Lab pair and `sync-core`; `link:` dependencies; the chat as a Core package with `panel/chat` as an adapter; the hook list; the Studio entries sentence replaces "legacy Studio imports remain compatibility exports".
- `extension-client.md`: panel directory table (`chat/`, `dom/`, `icons/`), the chat section's opening, and 25 old `panel/chat/...` paths remapped to `ui-components/src/chat/...` (stated as Core's `packages/ui-components`).
- `build-loop.md`, `element-identity.md`, `failure-taxonomy.md`, `testing-facility.md`, `web-capabilities.md`: 14 stale Core paths remapped, `AS/runtime/...` shorthand fixed, the model-text scan's target description updated.
- `README.md`: the `panel/chat` adapter in the shape list.

## Commands run and observed results

| Check | Command | Result |
| --- | --- | --- |
| 1, Core | `node scripts/structure-audit.mjs --rule docs-links` | `structure-audit: passed (0 warning(s), 0 baselined).` |
| 1, extension | same | `structure-audit: passed (0 warning(s), 0 baselined).` |
| 2 | `pnpm.cmd docs:reference`, then `pnpm.cmd docs:reference --check` | `Wrote ... (716 public declarations).` then `Deterministic framework reference is current.` |
| 3, Core | `git grep -nE "programs/automation-studio/(runtime\|storage\|model\|nodes\|dsl)\|fluxiq/automation-studio/(nodes\|testing\|actionability\|fingerprinting)" -- docs/architecture README.md` | no output, exit 1 |
| 3, extension | same | no output, exit 1 |

## Not verified

- About 130 further backticked tokens in `docs/architecture` are not paths that exist in the tree. Most are data files (`indexes/flows.json`, `snapshots/*.json`) or example names; the checker cannot tell them apart. I did not rewrite any of those. The retired grant modules named in `package-boundaries.md` (about lines 705-707) are left as written, because that entry describes what was removed.
- Path remaps are by rename detection and unique-name matching. I spot-read the diffs of about 60 and none was wrong, but I did not read all 271 plus 35.
- The plan's Destinations table was not reconciled with the docs; I trusted the source tree.
- Historical `t###` and dated asides remain in sections I did not need to touch; the long documents (`automation-studio.md` 2,970 lines, `llm-flow-bootstrap.md` 4,100) were not rewritten end to end.
- Lab statements in `testing-facility.md` and `repository-layout.md` that list "three libraries" for the Lab's own locks and web-build key (lines near 546 and 3515) were left: I could not confirm the Lab covers `ui-components`.

## Open questions or contradictions found

1. **Extension source points at the old Studio path (not mine to fix).** `scripts/check/model-text/targets.mjs:6` sets `RUNTIME` to `packages/fluxiq/src/programs/automation-studio/runtime`, which no longer exists. The check is meant to scan Core's model-facing text and may now scan nothing; I did not run it. The intended targets are `runtime/llm`, `runtime/flow-authoring/bootstrap/plan` and the instruction/words/description/prompt/catalog modules under the runtime areas.
2. **Extension build script path.** `apps/extension/scripts/build-extension.mjs:13` builds `fluxiqFingerprinting` from `programs/automation-studio/fingerprinting/index.ts`, which no longer exists (it is `runtime/target-matching/fingerprinting/index.ts`). The extension build was reported passing, so it may be unused, but it is a stale path.
3. `scripts/structure-audit/config.mjs` in the extension still bans imports matching `fluxiq/automation-studio/(nodes|action-effect)`; the neutral names are `fluxiq/automation/...`. Harmless today, but the ban no longer names what it guards.
4. Comments in source still name old handler paths (`runtime/llm/flow-execution-limits/resolution-within-flow-settings.ts:32`, `failed-builds.ts`), per thin-handlers.md. Not touched.
5. Core's `packages/fluxiq/package.json` states `fluxiq@0.26.0`; I documented the versions as they are, not any planned bump.
