# P9-G: default model key and the assistant's model

## Outcome
Done.

## What changed and why
- `secret-keys/runtime/model-key-settings.ts` (new): `ModelKeySettings`, reached as `service.modelKeys`. Holds the default key, the notice, and the assistant's key and model in one small record (`secret-keys:model-settings`, recordType `secret-keys-model-settings`) in the existing secret-keys repository. Ids, a model id and a notice only, never a value.
- No migration needed. An absent record reads as "the oldest enabled model key is the default", so the first key created is the default without an extra write (an extra write broke an existing put-counting test), and old stores work unchanged.
- Model key = enabled, kind `llm`. A disabled or custom key is never the default.
- Deleting, disabling or un-modelling the default writes the next enabled key (oldest first) and the notice "Your default key was removed, so <name> is now the default." (or "was disabled" / "is no longer a model key"; with none left: "...and there is no other model key. Add one in Settings."). Picking a default clears the notice. An assistant choice pointing at a lost key goes back to "the default" with its model.
- Assistant model: key (omitted = default key) and model (omitted = provider's normal). The model is kept with the provider it was chosen for and ignored if the key's provider differs. Refusals: "That key does not exist.", "That key is turned off, so it cannot ...", "That key is not a model key ...".
- Resolver: `service.modelKeys.resolveAssistant()` returns `{ok:true,keyId,keyName,provider?,model?}` or `{ok:false,reason:"Add a model key in Settings to use the assistant."}`. No value, never opened.
- `service.ts` wired (create/update/delete hooks; `snapshot()` and `snapshotFor()` now carry `modelSettings`); `key-store.ts` keeps non-key rows it reads (`otherRow`) so no second repository read; `types.ts` and `api/contracts.ts` add types and three endpoint names.
- Endpoints in `api/handlers.ts`, each with an `assistant` declaration: `set-default-key` (secrets.manage, key resource, no password), `get-assistant-model` (read), `set-assistant-model` (secrets.manage; refuses another person's key). Existing endpoints left undeclared.
- Contracts: `program-api/secret-keys/{default-key,assistant-model,index}.ts` and test; one line added to `program-api/index.ts`.
- Moved service methods behind `service.modelKeys` because `SecretKeysService` hit the 40-method audit limit.

## Commands run and observed results
- `npx vitest run src/programs/secret-keys` (packages/fluxiq): 17 files, 192 tests passed (includes new model-key-settings and model-key-endpoints tests: first key default, set-default-key, delete promotes with notice, disable promotes, disabled never default, restart persistence, legacy store, resolver no-key reason, assistant refusals).
- `npx vitest run src/program-api` (packages/contracts): 9 files, 32 tests passed.
- `node scripts/structure-audit.mjs`: no FAIL lines at the end (an earlier run showed one from another worker's automation-studio test placement, since gone).
- fluxiq `tsc --noEmit` (with the heavy lock, 3254 MB free): no errors.
- `assistant-parity.test.ts`: secret-keys lists only create-key, delete-key, reveal-key, rotate-key, snapshot, unlock, update-key (left to another brief); none of mine.

## Not verified
Browser/panel behaviour; real SQL repository for the settings row (only the in-memory repository and the SQLite-backed real-sql group existing tests); app-wide parity (other programs).

## Open questions
- The default is workspace-wide, not per user; the notice stays until someone picks a default (no dismiss endpoint). The panel brief may want one.
- Other brief wiring flows' "fall back to the default key" to `service.modelKeys.defaultKey()` is not done here; Flows' own model option is unchanged.
