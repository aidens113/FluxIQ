# Screens finish (t872)

## Outcome
Done for all four pieces, with two limits named below (no task list route; no screen yet shows a Flow's subflow, so "Save this" is built and not placed).

## What a person now sees
1. **Tasks.** The Automations tab lists real tasks: titled by their conversation, newest first, with attempts, result, Run again and Add budget (plus Carry on for a cut-off attempt). Rename and Delete are not drawn.
   - Core has no route that lists tasks. `taskOutcomes` reads by one conversation or one attempt. So the port lists the project's conversations (`list-conversations`, newest 100) and reads each one's attempts, then groups them by task. A failed read of any conversation fails the list, so it is never quietly partial.
   - Missing routes: list tasks across conversations; rename a task; remove a task. Steps (`readSteps`) wait on t870.
   - Run again on a listed task starts the Flow its attempts name (the chat's port only knew tasks it held this session).
2. **Library.** "Who uses it" now names each automation, opens it in the chat when pressed, and shows Core's own sentence when a newer version passed (`caller.newer.said`). Names come from the automations list; a name that cannot be read shows "An automation".
3. **Save this.** `savePart` is on the port (`save?`), with `saveThis(port, query)` in Core's `@fluxiq/ui-components` (a button, a status line, Core's own sentence for a refusal, "Saved. Find it in your Library." on success). Nothing is drawn when a port cannot save.
4. **Settings.** The project line says "This browser works in the project “Company website”. Change it in FluxIQ." once the name is known, and the old sentence until then.
   - Core's snapshot did not give the name. Added additively: `webRuntime.automationStudio.activeProjectName` in `apps/web` snapshot route, via new `automationStudioProjectName` (reads `projects` as the person). Extension reads it, keeps it in memory beside the project it belongs to, carries it on `ExtensionStatus.projectName` and into the chat's host status.

## Where "Save this" best belongs (no screen shows a Flow's subflow)
The build trace's "Pieces" lines (`chat/stream/step/project-words.ts`, under `chat/answer`/stream, another worker's area) and a task's details once t870 gives it durable steps. I did not mount it. To mount: call `saveThis(port, { projectId, flowId, subflowId })` where the piece is drawn; the styles are under `.library-screen`, so a host outside it needs the class or a small rule.

## Files
- Core: `screens/library/{types,port,host,index,create-library-screen}.ts`, `view/{users-part,detail-view,save-this,index}.ts`, `words/{save-words,index}.ts`, `testing/library/fake/{port,detail}.ts`, tests; `packages/fluxiq/.../api/project-name.ts` (+ exports, test); `apps/web/.../snapshot/route.ts` (+ test).
- Extension: `panel/tasks/*` (new `core-tasks-port`, `core-tasks-results`, `conversations-of-tasks`, `matching-tasks`, `read-tasks`, `summarise-tasks`; `tasks-port` now real), `panel/library/{library-port,read/*}`, `panel/shell/{mount-panel,contracts}.ts`, `panel/settings/project-line.ts`, `panel/chat/host-status.ts`, `shared/protocol.ts`, `background/connection/{core-api,project-context,index}.ts`, `background/connection.ts` (two lines: status carries the name, name change emits status), tests, three specs.

## Commands run
- `pnpm.cmd --filter @fluxiq/ui-components check` -> clean. `vitest run src/screens src/testing` -> 83 passed.
- Core `vitest run person-project.test.ts` (real SQL) -> 18 passed; `apps/web ... snapshot` -> 2 passed.
- `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> clean.
- `node scripts/test-extension.mjs panel/tasks panel/library panel/settings background/connection` -> 425 pass, 0 fail.
- Headed `test:content` (tasks-local-classifieds, library-professional-network, recording-settings-photo-social) on the final build -> 15 passed.
- `node scripts/structure-audit.mjs` -> passed in both repositories (after fixing the file-prefix and tests-count findings).

## What I saw (360 px, headed)
- Library detail, bottom: "Who uses it: 1 automation uses it.", the name as a link, a tinted note "A newer one of these steps passed a check on another page. It has not replaced this one.", Save this pinned below. Nothing overflowed.
- Save this refused: Core's sentence under the button, button still pressable; kept: "Saved. Find it in your Library." and button reads Saved, disabled.
- Tasks and Settings pictures are unchanged: their specs use the package's fake data, so the real task list and a real project name were not seen on screen.

## Not verified
- The real tasks port against a live Core (no live run; nothing spent). Tested against scripted `request` replies shaped as Core's.
- Core's real `newer.said` wording; the fake's sentence is mine.
- Settings with a name on screen; the line is unit-tested only. `lab-settings-driver.spec.ts` not run (no field moved).
- The name is not persisted: a restarted worker shows the nameless sentence until the next project lookup.

## Found, not mine
- `tasks-local-classifieds.spec.ts` "by keyboard" failed before my changes could matter: the Tasks and Library segments (from t866) sit between the search and the list as two Tab stops. I updated the spec for them.
- A tasks list costs one request per conversation; fine for 100, worth a Core list route.


## Round two: the two limits closed

**1. A real task list, rename and remove (Core routes).** Added `list-project-tasks`, `rename-task`, `remove-task`, registered as `list-conversation-task-attempts` was (handlers `task/project-tasks.ts`, logic in `answer-first/task-memory/project-tasks.ts`, endpoints and contracts in `api-contracts/automation`). The catalog was regenerated (`FLUXIQ_REGENERATE_IAM_CATALOG=1`: `studio:ListProjectTasks`, `studio:RenameTask`, `studio:RemoveTask`). Paired-token allowlist and narrowing in `apps/web/src/lib/program-route.ts` (rename and remove accept only project, task and name), with their tests. Carried through the relay (`listTasks`, `renameTask`, `removeTask`) and `extensionTasksPort`. The old conversation-by-conversation stopgap is gone: one call lists every task, newest first, paged, with the title (the person's name, else the Flow's), its thread for Open in chat, and the latest attempt. Search filters the list in the panel (Core has no search over a task's words), up to 1,000 tasks.
- Task memory store gained `list` and `remove`; the memory has an optional `title`. Attempt locator gained `conversationOfFlow` (one small additive method in `attempt-store`, outside the paths named; needed for Open in chat).
- **Remove forgets only the task's memory entry** and the index lines naming its attempts. Flow, saved parts, results and attempt rows stay, so the chat still shows what happened. Nothing else points at a memory entry, so nothing dangles. A repeat of the same words starts a new entry and works the steps out again. Classified `authoring`, not destructive, for that reason (a token may not call destructive endpoints).
- A task with no readable latest attempt is left out of the list; an unreadable attempt file refuses the list in words.
- The screen already drew Rename and Delete behind the port; they now show. Delete asks once. I changed its words to be true: "removes the task from your list, and what it remembers for next time. ... the chat and anything it did on the site stay."

**2. Save this, mounted on a task's details.** Under the task's action buttons: "Keep “<Flow's primary subflow name>” in your Library, so other automations can use it." and a Save this button; a refusal shows Core's sentence; on success "Saved. Find it in your Library." and the button reads Saved.
- Which subflow: the Flow's one active `primary` subflow, from `list-flow-subflows` (added to the paired-token allowlist as `read`; the relay asks only for the primary, active role of the named Flow). No primary subflow, or more than one, or a task that kept only notes: no button and no guess. A read that fails draws nothing.
- Mounted in Core's tasks screen (`TasksPort.subflowToKeep` / `keepSubflow`, `view/keep-view.ts`), over the extension's library `save`.

## Round two commands
- Core `packages/fluxiq` check -> clean; `vitest run .../tests/project-task-routes.test.ts` -> 5 passed (list, page, left-out ghost, rename, remove with Flow and attempts kept); `person-project.test.ts` earlier -> 18 passed; catalog tests regenerated and passing.
- `apps/web`: `vitest run src/lib/tests/program-route.test.ts src/app/api/programs src/app/api/client-gateway/snapshot src/app/api/tests/app-route-iam-parity.test.ts` -> 150 passed.
- `@fluxiq/ui-components` check clean; `vitest run src/screens src/testing` -> 85 passed.
- Extension check clean; `test-extension.mjs panel/tasks panel/library panel/settings background/connection background/automation-relay` -> 450 pass, 0 fail.
- Rebuilt, headed `test:content` tasks, library, recording-settings -> 16 passed. `structure-audit` -> passed in both repositories.
- Seen at 360 px: a task's details show Rename and Delete in the top row, then Carry on and Open in chat, then the keep line with Save this, Core's refusal sentence under it, and the interruption notice below. Nothing overflowed.

## Round two: not verified, and still missing
- Core's task routes were run on a real service's disk with attempts and memory written by the test, not by a live build; whether a live build always writes a memory entry per task was not exercised (a task with no entry would not list).
- The task's title is the Flow's name unless renamed; Core's memory does not keep the person's own words for a task.
- Search over tasks is done in the panel, not by Core.
- Delete and Save this in the real extension were seen only over the package's fake port in the specs; nothing live.
- `list-flow-subflows` is a new read for a paired token; its summaries hold names, roles and statuses only.
