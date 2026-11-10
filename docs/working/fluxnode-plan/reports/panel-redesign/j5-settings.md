# P9-J5: Settings page

## Outcome
Done, with one contradiction the supervisor must decide (delete-key is not a press-grant endpoint today).

## What changed and why
New `apps/web/src/features/settings-page/` (barrel per directory):
- `model/` (pure, tested): `key-rows` (model keys only; default = stored default while it is an enabled model key, else first enabled), `assistant-choice` + `provider-models` (key picker, model list from Core's registry `fluxiq/automation/llm-models`), `assistant-model-payload`, `allowance-input`/`allowance-words`, `new-key` (existing `create-key` shape: global enabled model key, password seals it, PIN only if typed), `remove-key` (the mint-then-call sequence), `engine-tools` (9 links to `/programs/<id>`), `types` (a `SettingsPort`).
- `data/`: `useSettingsPort` (adapter over three `useProgramApi`s), `useSettingsData` (reads `snapshot`, `get-assistant-model`, `get-panel-assistant-allowance`; actions `set-default-key`, `set-assistant-model`, `set-panel-assistant-allowance`, `create-key`, remove; re-reads after each).
- `ui/`: `SettingsPage` (publishes PanelContext `{page:"settings", keyId?}` for the selected key), `AiKeysSection`, `KeyList` (Default radio per key, accessible names "Make X the default key", "Remove X"), `AddKeyForm` (key box is `type=password`, emptied on send, never echoed or logged), `RemoveKeyConfirm`, `AssistantModelSection` ("The assistant uses [key] [model]" with plain explanation), `AllowanceSection`, `EngineToolsSection` (`<details>` closed by default), `settings-page.css` (single column, wraps, no sideways scroll).
- `apps/web/src/app/(panel)/settings/page.tsx` now renders `SettingsPage` (placeholder replaced).
- `apps/web/e2e/panel-settings.spec.ts` (written, not run): sections present, key box is a password box, Advanced closed then nine links with the right hrefs, 360px no sideways scroll. It adds and removes no key.

Removing a key: one press on "Remove", a confirm group, then `identity-access/mint-press-grant` with `{programId:"secret-keys", endpoint:"delete-key", payload}` and `delete-key` with that same payload plus `pressGrant`. A PIN field appears only if the engine says "PIN is required" (the person turned one on); the PIN is then sent instead of a grant.

## Contradiction found (not fixed, outside my paths)
`delete-key` is registered `classification: "program-gated"` and its handler calls `authorizeSecretMutation` (password, plus 2FA if set). `mintPressGrant` only mints for `destructive` endpoints, and `confirmDestructiveCall` only runs for them. So today the mint is refused with "That action does not need a confirmation." and the delete still wants the password. I handled it honestly rather than hiding it: on that refusal the page sends the delete without a grant, and if the engine answers `requiresRecheck` it asks, in plain words, for the person's password (tested). To get the briefed press-only removal, `delete-key` must become `destructive` with its password check removed (server side, `secret-keys/api/handlers.ts`; not mine). The page needs no change when that lands: the grant path is already first.
Likewise `create-key` still requires the password (it seals the value); the Add form asks for it.

## Commands run and observed results
- `cd apps/web && npx vitest run src/features/settings-page` -> refused at startup: `Core's library build is 326 minute(s) behind its source. Stale: ...assistant-tools.generated.json`. I did not build Core. Using a scratch config without the stale guard (`.../scratchpad/p9j5-vitest.config.mjs`, same esbuild/exclude as panel-shell's): `Test Files 4 passed (4)`, `Tests 24 passed (24)` (remove-key 6 incl. mint-then-call with a fake API, PIN path, no-confirmation path, refused mint/delete; key-rows 4; assistant-choice 6; allowance/new-key/engine-tools 8).
- Web typecheck under the lock (3287 MB free; an earlier attempt at 2170 MB was skipped by the rule): `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` -> exit 0, no output. Lock removed.
- `node scripts/structure-audit.mjs` -> my files first failed on `as-never`, `imports` (reached into automation-studio/settings; replaced with `provider-models.ts` from the registry) and `statement-packing`; all fixed. The final run shows no FAIL for settings-page, `(panel)/settings` or `panel-settings.spec.ts`; the 10 remaining FAILs are all `features/home/**` (another worker). Its total line read `10 violation(s) across 2 rule(s)`, so the audit as a whole does not yet pass; none are mine.

## Not built (no endpoint supports it yet)
Budgets default per Flow run, storage paths/size and "Clear caches", "Run the setup again", "test a key" (design mentions Test), reusable LLM contexts, legacy migration, and "last used" per key (shown only if the snapshot ever carries `lastUsedAtMs`; it does not today, so the column is absent).

## Not verified
- Playwright spec not run (panel not started, per brief); layout, `<details>` behaviour and phone width are by CSS reasoning only.
- Live behaviour against the real endpoints (response shapes taken from the type definitions and handlers: `snapshot` `keys`, `get-assistant-model` view, allowance `{allowanceUsd, chosen, defaultUsd}`).
- That the engine's PIN/no-confirmation refusal sentences match the regexes in `remove-key.ts` beyond the strings in `press-grant/refusals.ts`.
- The UI components have no render tests (only the pure model and data sequences).

## Open questions
- Decide the `delete-key` classification above.
- The default notice has no dismiss endpoint (brief G); the page shows it until a default is chosen, so choosing the same default again clears it.
- Changing the assistant's key resets its model to the provider's usual one (a model belongs to one provider).
