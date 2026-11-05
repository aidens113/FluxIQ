# t871 docs pass

## Outcome
Done. Four documents and two manifests brought up to date; the project line left unchanged (no name is reachable).

## What changed and why
- EXT `docs/architecture/extension-client.md`: Panel UI rewritten to the screens as coded: top bar without a record button; Chat with the setup card; Automations (search box, Tasks/Library segments, each only with its port; both ports are empty today); Settings in order with Advanced closed; Getting started as five steps (Unlock as a sixth only when the key reads locked). Directory table gained `tasks/`, `library/` and the new `getting-started/`, `automations/`, `recording/` rows. Added `PanelPorts` and its named seams (`extensionSetupPort`, `extensionTasksPort`, `extensionLibraryPort`, `extensionTasksMemory`), "Showing FluxIQ how" (composer, description dialog, bar, chip, caret, no tab jump, pending memory), the Lab opening Advanced through `packages/test-runner/src/extension-settings/`, and the check words now in `src/background/activity/host-words.ts`.
- EXT manifests chrome and firefox: description is now "Ask FluxIQ for a task in plain words and get the result. Connects only to the FluxIQ runtime you run and pair." (110 chars, limit 132). `manifest.e2e.json` already reads correctly; untouched.
- CORE `docs/architecture/package-boundaries.md`: new "The screens beside the chat" section, the two style entries in the package table, `ChatTaskOutcome.provenance`, `fillComposer`, version line corrected to 0.6.0 (it said 0.1.0), and a 0.6.0 migration note.
- EXT `docs/user/quickstart.md`: steps 1-4 use the panel's words (setup steps, Try again, Check the connection address, Settings > Advanced, the key card, Show me how and its dialog and chip, Stop). **Its unlock section (the step 3 paragraph on keys locked after a restart) is left exactly as it was for the lead to update when t865 lands.**

## Project name finding (item 7): nothing changed
No name is reachable. `ExtensionStatus` (`src/shared/protocol.ts`) has `projectId` only. `hostStatusOf` (`panel/chat/host-status.ts`) fills `ChatHostStatus` with `projectId` and never `projectName`, though Core's widget reads `projectName`. The background's only project lookup (`fetchProjectIdFromCoreSnapshot`, `background/connection/core-api.ts`) extracts the id from `/api/client-gateway/snapshot` and throws the rest away. No `fluxiq.panel.*` message and no automation-relay call returns a project. To add it: the background reads the name (the snapshot session might carry it; I did not check Core's snapshot shape) into a new `ExtensionStatus.projectName`, then `projectLine` and `hostStatusOf` use it. That needs a background change and probably a Core read.

## Commands run
- `node scripts/structure-audit.mjs` (EXT) -> first run FAIL (docs-links: link leaving the repository, fixed); then "passed (237 warning(s), 552 baselined)".
- `node scripts/structure-audit.mjs` (CORE) -> "passed (501 warning(s), 1097 baselined)".
- grep of `apps/extension`, `packages/test-runner`, scripts for the old description text: only `docs/user/store-listing.md` and `docs/working/hosted-production-plan.md`. Nothing asserts it; `verify-extension-target.mjs` only checks length 1-132.
- `node apps/extension/scripts/release/tests/release.test.mjs` -> fail 0 (not confirmed that it reads the real manifests).
- No source changed, so no extension check or panel test run.

## Not verified / claims not confirmed in code
- Quickstart: that the work header shows time, cost and one Stop, and that the answer ends with "what it saved" come from the main report and Core's `work-header/` and `answer/words/saved-words.ts` file names, not read line by line. Web-app steps (Secret Keys form, Automation Studio, Instructions) are unchanged and not re-checked.
- Doc: the Lab's use of `openSettingsAdvanced` was confirmed by grep (`demo-workspace/browser-session.ts:234`, `ui-e2e/journeys/extension-project.ts:32`), not run.
- The Panel UI section's older paragraphs (Open in FluxIQ, strip Stop, run follow) were left as they were and not re-verified.

## Needs from others
- `docs/user/store-listing.md` (lines 15 and 33) still carries the old summary and says it is the manifest description. I may not edit it; it now disagrees with the manifests.
- Core `docs/architecture/runtime-ownership.md:139` also says `@fluxiq/ui-components@0.1.0`.
- Words like "Flow", "Fixing your Flow" in the rest of extension-client.md (Live Activity and beyond) describe Core's activity words and were out of this brief.
