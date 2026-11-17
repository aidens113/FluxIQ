# Extension approved-client experience

Outcome: Done — extension source, authored documentation and scoped validation are complete. All 201 focused extension tests and the extension package typecheck passed; the lead independently reran both and reported both full structure audits passing. Browser acceptance was not run. Work is confined to the paired t914 extension checkout and this report; the separately assigned acceptance harness has its own report. No Core source, domain source, shared working document, git, browser, server or paid model operation was changed or run.

The extension opens ordinary model-key configuration directly, with no snapshot request for an unlock ticket and no unlock fragment. Setup now has five rows; model configuration is optional for connected chat and deterministic work. Unavailable configuration receives its real recovery guidance without another password or client-unlock action. Connection and approval status remain independent.

Readiness follows the frozen per-key `ModelKeyAvailability` from `fluxiq/ui`. The relay validates and reconstructs that object, discarding all extra fields and retaining malformed explicit metadata as null so readers report unknown. Boolean `heldByYou` survives the relay; explicit false excludes an administrator-visible foreign key before availability is read. Only absent metadata permits legacy compatibility; an old explicit `unlocked:false` is retained as an upgrade-required observation, with no old reason, true flag, ticket or unlock action. Supported enabled `llm` keys are required: absent provider means DeepSeek, normalized Anthropic/AnthropicClaude is supported, and custom or incompatible secrets never establish model readiness. Explicitly invalid provider metadata is preserved as unsupported rather than silently converted to the default. An available supported key wins; otherwise malformed status is unknown; otherwise the first unavailable cause is shown. This policy was coordinated with the shared UI worker.

Changed extension source paths, relative to the paired downstream root:

- `apps/extension/src/background/automation-relay/automation-relay.ts`
- `apps/extension/src/background/panel/open-fluxiq.ts`
- `apps/extension/src/background/panel/panel-control-deps.ts`
- `apps/extension/src/background/panel/panel-control.ts`
- `apps/extension/src/shared/protocol.ts`
- `apps/extension/src/panel/chat/transport/ports/models.ts`
- `apps/extension/src/panel/getting-started/extension-setup-port.ts`
- `apps/extension/src/panel/getting-started/setup-port.ts`
- `apps/extension/src/panel/getting-started/setup-card.ts`
- `apps/extension/src/panel/getting-started/index.ts`
- `apps/extension/src/panel/getting-started/model/index.ts`
- `apps/extension/src/panel/getting-started/model/key/{reading,from-reply,reader,index}.ts`
- `apps/extension/src/panel/getting-started/model/key/unavailable-line.ts` (new; ownership granted)
- `apps/extension/src/panel/getting-started/start/{steps,step-words,view}.ts`
- `apps/extension/src/panel/settings/model-key-line.ts`
- `apps/extension/src/panel/shell/mount-panel.ts` (ownership granted only to remove the obsolete fifth `startGuide` argument)
- `docs/architecture/extension-client.md` and `docs/architecture/testing-facility.md` (additional ownership granted): current approval, model configuration/custody and provider-free acceptance descriptions; historical receipts retained.

Changed/added adjacent tests:

- `apps/extension/src/background/automation-relay/tests/automation-relay.test.ts`
- `apps/extension/src/background/panel/tests/{open-purpose,panel-control}.test.ts`
- `apps/extension/src/panel/chat/transport/tests/{ports-send,failures}.test.ts`
- `apps/extension/src/panel/getting-started/tests/{extension-setup-port,setup-card}.test.ts`
- `apps/extension/src/panel/getting-started/model/key/tests/{from-reply,reader,unavailable-line}.test.ts`
- `apps/extension/src/panel/getting-started/start/tests/{steps,view}.test.ts`
- `apps/extension/src/panel/settings/tests/settings-order.test.ts`

Validation:

- From `apps/extension`, `$env:EXTENSION_TEST_BUILD_LABEL='t914-client-access'; node scripts/test-extension.mjs background/automation-relay/tests background/panel/tests panel/getting-started panel/settings/tests/settings-order.test.ts panel/chat/transport/tests` -> 201 passed, zero failed, after the lead confirmed immutable fresh contracts/Core/UI dist.
- From the paired downstream root, `pnpm.cmd --dir apps/extension exec tsc -p tsconfig.json --noEmit --incremental false` -> exit 0, no diagnostics.
- `git diff --check` over owned downstream source paths -> exit 0.
- `git diff --check -- docs/architecture/extension-client.md docs/architecture/testing-facility.md` -> exit 0. Scoped text review found no remaining current unlock-ticket/default-lock prescription in those sections; the new browser proof is documented as a requirement, not an observed pass.
- Source-only structure rules `file-lines`, `exported-values`, `test-placement` and `naming`, scoped to the 57 changed downstream source/test files across the two briefs -> zero failures. Existing shared `protocol.ts` has a non-failing 762-line advisory; the lead's full structure result is recorded below.
- Subsequent harness dependency preparation was refused by the Core freshness guard because SDK/WebSocket builds are stale after the contracts rebuild. No check bypass or worker Core rebuild was performed; the lead owns that final rebuild. Extension tests were not repeatedly run against moving dist.
- After the lead's complete Core checkpoint, all four required downstream dependency builds passed; the final documented test-runner build/typecheck and its 22 scoped helper tests also passed (separate harness report).
- Repository-aware `docs-links` on the two edited architecture documents -> zero failures and warnings. An initial probe incorrectly narrowed the known-file universe and was discarded; rerunning with the complete repository context established that its apparent missing targets were a probe error.
- Lead independently reported extension 201/201, extension types, and both complete structure audits passing after the packing fixes. The worker's own scoped `statement-packing` check passed with zero failures/warnings.
- Final `git diff --check` on the owned downstream paths and both Core reports -> exit 0, no output.

Not verified by this worker: full structure audits beyond the scoped rules (lead reported them passing), extension bundles, Chrome/Edge side panel or Firefox popup rendering/lifecycle, actual browser approval/provider-free model access, deterministic replay, reconnect/restart, configured-later authority, logout and explicit revoke. UI metadata alone does not prove retrieval or authorization. No browser or paid call was authorized or run.

Integration needs: run the replacement approved-client browser acceptance when separately authorized, with the normal matching extension/host artifacts prepared. The server-side safe snapshot projection was fixed and rebuilt by the lead before the final harness checkpoint. No manifest, browser permission, token storage, gateway authentication, domain or executable-action behavior changed in this partition.
