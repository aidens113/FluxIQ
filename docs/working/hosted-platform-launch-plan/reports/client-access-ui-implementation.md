# Shared UI and web approved-client access

Outcome: Done for the owned UI/web implementation and focused acceptance. No builds, servers, paid calls or git operations run by this worker.

Changed shared UI model readiness to consume sanitized `ModelKeyAvailability` through the public `fluxiq/ui` parser. Only enabled LLM keys compatible with the runtime count; missing provider defaults to DeepSeek and the Anthropic Claude alias matches the runtime. Valid explicit availability takes precedence over legacy flags. Explicit old `unlocked:false` produces update-required feedback; malformed/unknown metadata never becomes ready. Available compatible candidates win; otherwise malformed observations remain unknown, then a known unavailable cause, then missing model configuration.

Saved-key recovery, host protection failure and unreadable ciphertext have distinct configuration messages. Readiness polling and focus refresh continue when configuration changes. Missing/unavailable model setup does not disable the composer or deterministic operations. Historical `model_key_locked` records remain readable with neutral unavailable/recheck words and no password/unlock action; fixtures intentionally retain those historical records.

Removed web approval password/TOTP fields, state and payload and the unused layout prop. Reference matching, approve/reject, expiry/withdrawn notices and the authenticated runtime permission gate remain. The lead owns the matching approval route change to `{session}`.

Removed the Secret Keys browser chooser, ticket/hash ingestion, unlock dialog/action and the entire `manager/unlock` helper subtree/tests. Reveal/create/edit/rotate/delete authorization and operation ownership were preserved. The keys overview and secret manager now show sanitized availability with actual causes. The web chat adapter now carries availability instead of stripping it; invalid metadata and old explicit refusal cannot fall through to an enabled-key ready claim. Only safe capability fields leave the adapter.

Owned production files changed:

- `packages/ui-components/src/chat/onboarding/{model-readiness,model-unavailable-words,index}.ts`, `chat/view/empty-state-model.ts`, `chat/chat-widget.ts`, `chat/answer/words/waiting-words.ts`, `chat/ports/results.ts`, `screens/tasks/model/{state,waiting}.ts`, and historical fixture comments.
- `apps/web/src/app/{GlobalClientGatewayPairing.tsx,layout.tsx}`, `features/chat-widget/transport/models-port.ts`, `features/security/model/{types.ts,shape/key-row.ts}`, `keys/{KeyAvailability.tsx,KeysList.tsx,KeysSection.tsx,index.ts}`, `keys/manager/SecretKeysLive.tsx`, and `page/SecurityKeysPage.tsx`. Deleted `keys/manager/unlock/{index.ts,unlock-offer.ts,tests/unlock-offer.test.ts}`.

Tests authored/updated cover readiness causes, provider/kind compatibility, malformed data and mixed old/new metadata; chat refresh with an enabled composer; historical wait copy; safe availability projection and actual authorization refusal; an approval POST containing only the pairing reference and no password fields; availability list rendering/redaction; and removal of the key manager's old chooser/action. Existing reveal, ownership and recovery tests are included in the planned scoped validation.

Foreign admin-visible keys with explicit `heldByYou:false` are ignored by chat readiness. The web port preserves that boolean, and focused tests cover foreign available/unavailable/absent/malformed metadata without making it the caller's setup requirement.

Validation after the lead's coordinated contracts/Core/UI rebuild:

- From `packages/ui-components`: `pnpm.cmd exec vitest run src/chat/onboarding/tests src/chat/view/tests/empty-state-model.test.ts src/chat/tests/chat-widget.test.ts src/chat/ports/tests/results.test.ts src/chat/answer/words/tests/waiting-words.test.ts src/chat/answer/tests/model.test.ts src/screens/tasks/model/tests/model.test.ts src/testing/results/tests/port.test.ts` -> 8 files, 91 tests passed; 14.20s.
- From `apps/web`: `pnpm.cmd exec vitest run src/app/tests/GlobalClientGatewayPairing.test.ts src/app/tests/client-pairing-approval.test.tsx src/features/chat-widget/transport/tests/models-port.test.ts src/features/chat-widget/tests/program-chat-transport.test.ts src/features/security/keys src/features/security/data/tests/loaders.test.ts src/features/security/page/tests/security-page.test.tsx` -> 13 files, 147 tests passed; 55.59s. Existing React renderer deprecation notices did not fail the run.
- Lead independently reported Core/web type checks passed. Worker did not claim those as an independently run check. After those runs, expanded four switch cases in web `KeyAvailability.tsx` to remove statement packing found by the lead's structure audit; no behavior changed. No library rebuild or guard bypass was performed by this worker.

Additional read-only review requested by the lead covered `platform/custody/keyring/**`, `runtime/models/secrets/session-key.ts`, and `_shared/key-access/authority.ts`. Findings were sent to the lead only: default key selection aborted before a later usable compatible key; explicit service keyring reads bypass private-file checks; existing-file reads had path/parent validation races; the local initialized marker lacked durable flush. The lead reported the candidate-selection fix and five passing tests. No backend source edited by this worker.

Not verified by these UI tests: full backend/UI combined behavior, browser rendering, cold restart/migration, copied-token revoke, real provider failures, or deployment. Separate actual runtime acceptance passed 15 tests, recorded in `runtime-client-access-acceptance.md`. No source-only UI change is claimed to establish authorized key access; backend implementation and combined acceptance are required.
