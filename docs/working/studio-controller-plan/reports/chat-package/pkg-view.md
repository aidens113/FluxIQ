# pkg-view report (t846)

Outcome: Partial. Everything in my paths passes except 17 `web-vocabulary` audit findings, which need a config change outside my paths.

## What changed
- Vitest conversion: `import test from "vitest"` became `import { test } from "vitest"` in 27 tests. No `before`/`after`/`t` context uses were left in my paths.
- `chat/stream/run-target.ts` and `target-activity.ts`: dropped the duplicate/missing `ChatActivityState` import from `fluxiq/ui`; it comes from `../ports/index.ts`.
- Comments: removed misleading `panel/...` wording (fake-dom, lucide-nodes, run-target, project-words test, tokens.css, chat.css).
- `emptyStateModel(mode, target, readiness, offers = { extract: true })`: without extract the latest chat offers only "Describe what you want". Test added in `empty-state-model.test.ts`.
- `chat.css` is self-contained. Added under `.chat-panel`: `.small-button`, `.link-button`, `.open-fluxiq`, `.card-actions`, `.notice`, `.notice.danger` (copied unchanged from the extension's shell.css). The shell's page resets the chat relies on (box-sizing, button/input font, button cursor/disabled/focus, heading/p margins, reduced motion) are scoped with `:where(.chat-panel)` so specificity stays as before. No bare `html`/`body`/`*` selectors remain. `tokens.css` keeps `:root`.
- Unstyled hook classes (no rule anywhere; the test lists them): `button`, `chat-key-text`, `chat-project`, `chat-project-card`, `chat-project-item`, `chat-read-notice-text`, `chat-read-retry`, `composer-draft-review`.
- New `chat/view/tests/styles.test.ts`: built classes are styled or listed hooks (and the hook list has no stale entries); `var(--x)` without fallback is defined in tokens.css; chat.css has no bare page selectors.
- Audit fixes: tests import `testing/index.ts` (barrel) instead of `fake-dom.ts`; `as never` in `action-card-view.test.ts` replaced by a typed `TurnControls`; one statement per line in `target-activity.test.ts` and `scroll-follow.test.ts`.

## Commands run
- `npx vitest run src/dom src/icons src/testing src/chat/view src/chat/stream src/chat/format` -> Test Files 28 passed (28), Tests 180 passed (180). (Earlier 3 view tests failed only on the sibling's `conversation/controller.ts` importing `../../../shared/constants`; it resolved once they fixed it.)
- `npx tsc --noEmit -p tsconfig.json | grep -E "src/(dom|icons|theme|testing|chat/(view|stream|format|target|same-thread))"` -> no lines.
- `node scripts/structure-audit.mjs | grep <my paths>` -> only advisory `file-lines` warns (stream/step/messages.ts 438, its test 644; both over the 400 advisory, not failures) plus 17 `web-vocabulary` FAILs; no other failing kind.

## Open: web-vocabulary
`CONFIG.domainNeutralPaths: ["packages"]` in `scripts/structure-audit/config.mjs` now covers `packages/ui-components`, a DOM package by purpose (class name, aria, tag name, scroll, selector in `dom/`, `view/`, `testing/fake-dom.ts`, `icons/`). I did not edit config or add baseline entries. Fix for the supervisor: scope the rule to exclude `packages/ui-components` (for example list the neutral packages instead of `packages`). Sibling-owned tests that import `testing/fake-dom.ts` directly will hit the `imports` barrel rule the same way I did; point them at `testing/index.ts`.

## Not verified
Visual look of chat.css in a browser (rules copied verbatim, by reading); full audit outside my paths.
