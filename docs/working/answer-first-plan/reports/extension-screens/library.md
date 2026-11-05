# Subflow library (t871, library worker)

**Outcome: Done**, with the real wiring left as one named seam (`LIBRARY_LANDED = false`).

## What a person sees
1. The library lists subflows by site host, each with a name, a plain state ("Not proven yet", "Worked once", "Works reliably") and "uses N subflows". What a subflow calls is nested under it. A failure since reads "Last failed 1 Nov" in text, in warning colour, never colour alone. Empty: one sentence on what the library is and how a subflow gets there.
2. Search (driven by the tab) keeps every match and the path to it (path rows are shaded); the tab hears a count through `onMatches`.
3. Pressing a row opens the details: what it does, works on, needs (required or optional in words), hands back, can do ("Can spend money"), "Always uses: Sea green", what must be true to start, steps in order, what it calls (press to open), who uses it, how it has gone. Run and Ask about it sit at the top. Back and Escape return, with focus on the row or link that opened it.
4. Run: a form with real labels. A missing required value is told in words and not sent. A lasting act is one press, once ("Allow it to spend money and create new things this once"), never a PIN. A repeat is "Go ahead", once. The button says "Running..." and cannot be pressed twice. Outcomes read "It finished and saved 3 rows.", or "It stopped at Apply filter: ...". They never carry a tick or a failed ending. Next steps: Try again, Ask about it (which fills the composer through the host).

## Files
CORE `packages/ui-components/src/`: `screens/library/` (`types.ts`, `port.ts`, `host.ts`, `read-library.ts`, `create-library-screen.ts`, `tree/`, `words/` with `lasting/`, `view/` with `run/`, `library.css`, `tests/`), `testing/library/fake/` (cards, detail, port, tests) and one export line in `testing/index.ts`.
EXT `apps/extension/src/panel/library/`: `library-port.ts` (`createPartsLibraryPort`), `extension-library-port.ts` (the seam), `create-extension-library.ts`, `read/`, `tests/`; spec `e2e/content/tests/screens/tests/library-professional-network.spec.ts`.

## Commands and results
- CORE `pnpm.cmd --filter @fluxiq/ui-components check` -> clean (twice, last after the final change).
- CORE `vitest run src/screens/library src/testing/library` -> 4 files, 41 tests passed (tree 9, words 10, screen 20, fake 2).
- CORE `node scripts/structure-audit.mjs` -> passed at the time of the run.
- EXT `EXTENSION_TEST_BUILD_LABEL=t871 node scripts/test-extension.mjs panel/library/` -> 9 pass, 0 fail.
- EXT `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> two runs. The first had 3 type errors in my read files. I fixed them. The second printed no error and was not stamped, because another lane edited `apps/extension` while it ran.
- EXT structure audit: no violations in my files. Four remain in others' files (`automations-tab.ts`, `automations-tab-search.test.ts`, `task-memory.test.ts`; a fourth was mine and is fixed).
- Headed spec, `pnpm.cmd run test:content ...library-professional-network.spec.ts --headed --workers=1` -> 6 passed (final run after all fixes).

## Pictures
Taken under `apps/extension/e2e/test-results/content/artifacts/screens-tests-library-prof-*/`: tree, search-colour, search-none, detail-top/bottom/fixed-value, keyboard-row-focus, keyboard-detail-focus, keyboard-back-on-row, run-form, run-missing-value, run-act-not-allowed, run-finished, run-finished-rows, run-stopped, run-running, refusal-part-wrong_site, refusal-part-repeat_refused, refusal-confirm-repeat, detail-read-failed-quietly. I read them all at 360 px.
- Nothing overflows. Focus rings are visible. Wording read clearly.
- Fixed after looking:
  - Sections after the steps had no spacing.
  - An empty div took a gap while the read was in flight.
  - Focus was lost when the steps arrived and redrew the details. The screen now hands focus to the same control.
  - "FluxIQ has not checked this result." showed on stopped runs, so it now shows only on finished ones.
- The "path only" rows in a search are shaded, which is subtle.

## Seam and wiring
`LIBRARY_LANDED = false` in `extension-library-port.ts` makes `extensionLibraryPort(request)` return `undefined`. `createExtensionLibrary(request, port, host)` uses `port ?? extensionLibraryPort(request)` and returns `undefined` when neither exists, so the tab shows no Library segment. When t866 lands, set the flag to `true` and replace the three message literals in `library-port.ts` with `AUTOMATION_PANEL_MESSAGES.listParts`, `getPart` and `runPart`. The tab calls `render`, `search`, `setActive` and `onMatches`.

## Not verified
- No real Core or t866 relay; only t866's shapes, as tests.
- No Firefox popup or Chrome side panel mount; only the 360 px frame.
- Search is local over the loaded subflows (up to 10 pages of 50). Beyond that the screen does not say so.
- Pressing Back during a run leaves it running, and its outcome is not shown on reopening.
- The tab wiring and the `chrome.*` host callback are the lead's.
- No `shell.css` or `Escape` interaction with the tab was exercised.

## Needed from others
- The lead wires the library into the tab: the segment, the search box, and the count from `onMatches`. `askAbout(text)` must fill `#conversationInput` and show Chat.
- Nothing needed changed in Core's protected paths. t866's message names are written as literals until it lands.
- The tasks lane's `as never` casts, which failed the Core audit earlier, were gone by the final run.
