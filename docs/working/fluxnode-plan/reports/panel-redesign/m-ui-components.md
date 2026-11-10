# Brief P9-M: panel-wide thread and page/selection on screen (@fluxiq/ui-components)

## Outcome

Done. Additive, optional type changes in `packages/ui-components/src/chat/ports/` plus the version bump. All three acceptance checks pass.

## What changed and why

1. `src/chat/ports/transport.ts`: `ChatSubjectKind` is now `"project" | "flow" | "run" | "panel"`. Its doc comment says `panel` is the panel-wide thread.
   - No exhaustive switch or record over `ChatSubjectKind` exists in the package. Grep found only assignments and a parameter type, so no `panel` case was needed.
   - No code derives a title from `ChatSubjectKind`, so no title text was added. The `title.ts` derivation uses a different type (`ThreadSubjectKind`), which the brief did not name.
2. `src/chat/ports/selection.ts` (new): exports `ChatSelection` with the eight optional fields from the brief. It is in its own file and exported from `src/chat/ports/index.ts`.
3. `src/chat/ports/transport.ts`: `ChatOnScreen` gains `page?: string` and `selection?: ChatSelection`, beside the existing `flowId`, `runId` and `recordingId`.
4. `packages/ui-components/package.json`: `version` 0.11.0 to 0.12.0. The diff is the one line.
5. `src/chat/ports/tests/panel-subject.test.ts` (new), three tests:
   - `"panel"` type-checks as a `ChatSubjectKind` and in a `ChatThreadListQuery`.
   - A panel message with `page`, `selection` and `recordingId` in `onScreen` goes through a `ChatConversationPort.send` stub unchanged. The stub asserts identity and deep equality, and `expectTypeOf` checks the field types.
   - A message with none of the new fields still type-checks and sends as before.

Step 3 (pass-through from the widget) needed no code. `threadSendRequest` in `src/chat/conversation/thread-requests.ts` builds `onScreen` only from the chat target and the recording id, and the widget has no option that supplies `page` or `selection`. Adding one would be a new client input the brief did not ask for, so I left it out. `thread-requests.ts` is unchanged.

## Commands run and observed results

- `cd packages/ui-components && npx vitest run src/chat` -> `Test Files 102 passed (102)`, `Tests 671 passed (671)`, exit 0. This includes `src/chat/ports/tests/panel-subject.test.ts` (3 tests passed).
- `cd packages/ui-components && npx tsc --noEmit -p .` -> no output, `EXIT=0`. The tsconfig includes `src/**/*.ts`, so the new test file is checked.
- `node scripts/structure-audit.mjs` (from the Core root) -> `structure-audit: passed (535 warning(s), 1095 baselined).` Exit 0. None of the warnings name `chat/ports` or the new files. The output is in `C:/Users/osrs_/AppData/Local/Temp/claude/bc302d3e1bd85154/1d7e40a9-22b4-41e1-ad74-ba7e457da62b/scratchpad/p9-m-audit.txt`.
- `git diff --stat -- packages/ui-components` (read-only) -> `package.json` 1 line, `ports/index.ts` 1 line, `ports/transport.ts` 20 lines. Plus the two new files. Git printed a CRLF/LF notice for `package.json`; the diff shows only the version line changed.

## Not verified

- The extension (the browser client) was not compiled against the new types. The changes are additive, but the brief's claim that existing clients are unchanged is only checked by this package's own typecheck.
- `packages/ui-components/dist/` was not rebuilt. It still holds the 0.11.0 declarations, so consumers that read `dist` do not see `panel` or the new fields until `pnpm build` runs.
- No live or browser behaviour was exercised. This is type and unit level only.

## Open questions and contradictions found

- **Panel threads would be dropped by the thread-list reader.** `src/chat/conversation/thread-list/parse.ts` line 7 has `SUBJECT_KINDS = ["project", "flow", "build", "run"]`, and `summary.ts` has `ThreadSubjectKind` with the same four values. A thread Core returns with `subject.kind === "panel"` makes `parse` return `undefined`, so it would not appear in the list. Adding `"panel"` there is a one-line change in `src/chat/conversation/`, which is outside this brief's owned paths. The supervisor needs to decide whether to assign it.
- **No client can send `page` or `selection` yet.** The widget has no input for them, so the new fields exist in the type but no code path fills them. A follow-up brief would have to add a widget option and pass it into `threadSendRequest` (step 3's conditional case).
- **No panel-thread send path yet.** `threadSendRequest` has no branch for a `panel` target. The brief did not ask for one.
