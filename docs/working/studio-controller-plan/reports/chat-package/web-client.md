# Chat package: the web panel as a second client (t846)

## Outcome

Done. `apps/web` mounts the real `@fluxiq/ui-components` chat widget through a thin React wrapper, against Core's real
conversation endpoints, at `/programs/automation-studio/chat?projectId=`. No package change was needed. No panel start,
browser run or paid call.

## What changed and why

New `apps/web/src/features/chat-widget/` (barrel and `tests/` throughout):

- `transport/`: `createProgramChatTransport(api, { projectId(), secretKeys?, activityTimers? })` answers a `ChatTransport`.
  The project comes from a getter, so a project change needs no new transport.
  - conversation: `list-conversations` (the project's own thread asked for by subject kind `project`, id = project id),
    `get-conversation`, send = `open-conversation` when there is no thread, then `sendConversationInstruction` (the
    panel's own send: `append-turn` with the capability vocabulary and `onScreen`, so Core executes the work and the
    panel runs what Core did not), `answer-ask` flat.
  - runs: stop = `cancel-flow-bootstrap` (build) / `cancel-runtime-session` (run) / list active runs then cancel each;
    take over = `pause-runtime-session` + `takeControl`; hand back = `resume-runtime-session` + `afterManualAction`
    (all as the extension's `run-control.ts`).
  - recordings: `list-recordings` summaries (page counted from 1 to offset). models: Secret Keys `snapshot`, cut to
    kind, provider, enabled.
  - failures: `chat-failure.ts` maps the panel's `ApiResponse` to `ChatResult` codes: status 0 -> `unreachable`,
    408/504 -> `timed_out`, 401 -> `refused`, 400 -> `invalid_request`, a `requiresRecheck` or Core diagnostic code
    passes through (so `automation.instructions_required` still reaches Take over / Hand back), else `failed`.
  - Left absent: `runs.openInstructions` (the Studio owns task instructions) and `activity.setOverlay` (no page overlay).
- `activity/`: `createProgramActivityPort`. `read` = `get-activity` -> `ChatActivityState` (`overlay: "hidden"`, `live`
  true after a good read, `recent` from the snapshot, `display` from the shared `ActivityPacer` with the Studio's
  `CONVERSATION_ACTIVITY_HOST_WORDS`, `history` from `holdConversationActivity`). `subscribe` starts the Studio's
  `createBackoffPoller` (fast while the work runs, slow beat while hidden, reread on visible) and stops it, and drops
  the session, when the last subscriber leaves. A failed poll re-tells the last state with `live: false`.
- `ChatWidget.tsx` (props: `transport`, `projectId`, `automation?`, `status?`, `openControl?`): creates the widget once
  in an effect, `host.append`, `render`, `setActive(true)`; unmount `setActive(false)` and removes the element. A project
  change renders a new `ownerKey` (`["web", projectId]`); an automation prop calls `open`. `ProgramChatWidget.tsx`
  binds it to `useProgramTransport("automation-studio")` and `("secret-keys")`; `ChatWidgetPage.tsx` is the chat alone,
  filling the window.
- `chat-widget.css`: every custom property `tokens.css` defines, on `.chat-widget-host`, from the panel's tokens. It does
  not import `tokens.css`. `studio-open-control.ts`: the `openControl`, a link to the Studio.
- Route: `app/programs/automation-studio/chat/page.tsx` (auth as the Studio page, `?projectId=`, renders
  `ChatWidgetPage`). Config: `apps/web/package.json` dependency, `vitest.config.ts` LIBRARIES gets `ui-components`,
  `pnpm-lock.yaml` via `pnpm install --offline`. `next.config.ts` unchanged (CSS and `.ts` resolve through the package).

No `onExtract` (the panel has no extraction sheet). `openControl` links to `/programs/automation-studio?project=`: a
permission ask that needs the PIN is refused with the reauthorization code and the sentence points to the Studio, because
the widget has no PIN dialog.

## Commands run and observed results

- `cd apps/web && npx tsc --noEmit` -> exit 0, no output.
- `cd apps/web && npx tsc --noEmit -p tsconfig.build.json` -> exit 0, no output (package `dist` was current).
- `cd apps/web && npx vitest run src/features/chat-widget` -> 5 files, 41 tests passed (tokens 2, activity port 6,
  mounted widget 4, transport 25, real Core 4).
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (494 warning(s), 1110 baselined)`, no baseline entry
  added, no warning from the new files. (An earlier run failed 3 `[imports]` barrel rules; fixed.)

Tests: (a) `ChatWidget.test.tsx` mounts the real widget under `react-test-renderer` and the fake DOM with a fake
transport: element appended, thread listed and read, the turn rendered, a typed send reaches `send`, unmount unsubscribes,
stops reading and removes the element, a project change keeps one widget and lists again. (b) exact endpoints and
payloads. (c) `core-chat-transport.test.ts` reuses the existing `openContractWorld` (Core's real registry and service):
list, open, send, read, answer, `get-activity`, `list-recordings`, `cancel-runtime-session`, and asserts every field sent
is a field Core read. It sends once, reaching only that world's scripted model. Cheap (about 2 s after seeding).

## Not verified

No browser: CSS appearance, the real `useProgramApi` fetch path, and the mounted route were not exercised (the route file
is covered only by typecheck). `take over`, `hand back` and the `cancel-flow-bootstrap` stop are tested against a fake
transport only, not Core. The `models` port is untested against the real Secret Keys program. `commitRuntimeRunChanged`
is not called after Stop/Take over/Hand back, so another mounted Studio surface learns by its own poll.

## Open questions or contradictions

- `sendConversationInstruction` returns only an error string, so a failed send maps to code `failed` (the extension relay
  keeps `unreachable` / `refused`). A refused session on send therefore does not trigger the chat's "refused" fallback.
- `startConversation` is not in the conversation barrel, so the open is posted directly (five lines) rather than importing
  a file past the barrel (audit rule).
- Core's real conversation record has `subject: { kind, id }`, not the flat `subjectKind`/`subjectId` the package's fakes
  use. The widget's reader only needs `conversationId`, `projectId`, `revision`, so it works; the fakes are looser than Core.
- `ActivityTimers` is exported from `chat-widget/activity`; `packages/**` untouched.

## Replacing the panel's own conversation UI: what it would take

The widget lacks, against `ConversationViewContent`/`ConversationDock`:

1. Panel capability commands (`runCapability`, `describeCapabilities`) as UI: the PIN-confirmed deletes and payments
   (`conversationAnswerNeedsReauthorization`, the re-authorization dialog). The widget needs a PIN port or a host callback
   from `answer`, plus a ChatResult code for "needs PIN".
2. Attachments rendered in place (graph diffs, panel-result attachments, `getConversationAttachment`): the widget has no
   attachment-renderer port.
3. A thread list / switcher across conversations (the widget shows one thread plus "Latest chat"), and the unanswered-count
   badge and the dock launcher (`conversationLauncherLabel`, `unansweredConversationCount`).
4. Selected-conversation restore (`requestedConversationId`, `onSelectedConversationChange`) and the project-name heading.
5. Change-feed refresh from other surfaces (`conversation.changed`, `runtime-run.changed`) in place of polling.
6. `onExtract` and the Open FluxIQ handoff replaced by in-panel navigation.

Each is a port or host callback on the package, then wiring here; none is a rewrite of the widget in React.
