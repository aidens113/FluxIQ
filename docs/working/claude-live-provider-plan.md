# Claude Live Provider Plan

Status: Complete
Status detail: Claude runtime, keys/settings and $5 live-test defaults validated and integrated in both repositories.
Created: 2026-10-30
Last updated: 2026-10-30
Owner: Senior supervisor agent
Scope: Use CLAUDE_API_KEY for all live tests; implement real Claude provider, encrypted-key routing and model selection in Core, and provider-aware credential/default/accounting paths in the Lab.
Paired document: ../!FluxIQWebExtension/docs/working/claude-live-provider-plan.md
Related: [Framework continuation](framework-heavy-lifting-plan.md)

## Current State

The user requested Claude for every live model-backed test and explicitly asked that preference be recorded.
Both repositories' AGENTS.md now hold it. Never silently fall back to DeepSeek. Provider-free tests remain provider-free.
CLAUDE_API_KEY is present in the main downstream .env.local; its value was never printed or committed.
Standard task provisioning copies ignored local environment into authoring worktrees; provider-free tests reject its credentials. Remove a new sweep's disposable copy before checks; preserve the main file.
Anthropic originally appeared in the keys UI without runtime support. Core now implements the native provider, per-call encrypted-key resolution and matching model/settings controls; the Lab migration passed its owning checks.
Paired task t816 is integrated: Core61d29c1f and downstream fa99782d, with Core library version0.9.0. No paid model call has run.
Live default: claude-sonnet-5-5, provider anthropic, selected for agentic task quality and speed; explicit model selection remains available.
The user raised Claude live tests to $5 per whole Flow build, not each call. Explicit lower limits remain effective; ordinary product defaults remain separate.
Lead independently observed native Claude tests: 4 files / 33 passed; legacy DeepSeek/session/settings: 19 files / 196 passed. All use fake transports/credentials, with no paid calls.
A stale private root workspace dependency was changed from0.7.0 to workspace:* and its lockfile regenerated offline. Native output limits are preserved.
Keep identical realistic task instructions/oracles and record both source commits, model, verdict, calls, provider-reported usage/cost and runtime.
Historical DeepSeek runs predate these Core fixes, so comparison with them cannot isolate the provider's effect.
No paid run is started by implementation or unit validation; existing supervised paid-launch requirements remain.

## Implementation

1. Core: Anthropic Messages adapter behind existing provider contract; native schema output with local validation,
   abort/time/response limits, refusal/truncation/balance handling and usage-aware billing. Preserve opaque session keys.
2. Core: provider-aware models/settings and per-call unlocked key resolution; expose Anthropic (Claude) in keys/model UI.
   Existing DeepSeek keys and explicit configurations remain functional; an unavailable Claude key never selects DeepSeek.
3. Lab: provider-aware model/profile validation, CLAUDE_API_KEY credential resolution, key setup, default routing,
   child-process secret stripping, reporting and demo/live entry points. No provider HTTP implementation downstream.
4. Verify fake-HTTP provider requests/errors/accounting and UI/key/session roundtrips; changed owning Lab tests,
   affected package types, structure/model-text/docs checks. Lead independently verifies worker claims after integrating dev.
5. Commit and integrate both branches through pnpm task, push both dev branches together. Qualify a supervised Claude
   live run on an allowed realistic site when the launch is authorised; do not claim unit checks establish live quality.

## Verified Provider References

Official sources checked 2026-10-30: https://platform.claude.com/docs/en/models/overview,
https://platform.claude.com/docs/en/api/messages/create,
https://platform.claude.com/docs/en/build-with-claude/structured-outputs and
https://platform.claude.com/docs/en/about-claude/pricing.
Sonnet 5.5 uses id claude-sonnet-5-5, 1M context and 128K output; listed input/output rates are $2/$10 per million tokens.
Messages schema output uses output_config.format; refusals and truncation require explicit handling despite structured output.

## Work Ledger

### 2026-10-30 - Initial investigation and provider switch
- Agent: lead
- Finding: key variable present; UI lists Anthropic; runtime and Lab are DeepSeek-only.
- Validation: `node -e` credential-presence probe -> `CLAUDE_API_KEY: present`; no value emitted.
- Not verified: any Claude request, product key roundtrip or live task.

### 2026-10-30 - Independent implementation acceptance
- Agent: lead
- Validation: native Claude owning tests -> `4 files, 33 passed`; legacy DeepSeek/session/settings -> `19 files, 196 passed`; Claude settings and Secret Keys UI interactions -> `2 files, 33 passed`.
- Validation: `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket build` -> `all passed` after regenerating the root workspace pin/lockfile. Worker package/web typechecks also passed; lead inspected their output and independently reran the behavior checks above.
- Validation: downstream test-runner `check` and `build` -> `both passed`; compiled live-llm owning tests -> `150 passed`; non-live owning files/commands/interactive-session -> `241 passed`; contract/default checks -> `11 passed`; launcher/key-source checks -> `7 passed`.
- Validation: `node scripts/structure-audit.mjs --update` -> `1144 entries, 4 lowered, 8 removed, none added`; `git diff --check` -> `passed`. Native output limits and ordinary product defaults remain separate from the isolated $5 whole-build allowance.
- Not verified: paid Claude calls, browser key-entry roundtrip or a performance comparison. No panel management or full sweep.

### 2026-10-30 - Paired integration
- Agent: lead
- Validation: `pnpm.cmd task finish t816 'Claude runtime and five-dollar live-test allowance' --skip-checks` -> mandatory contract gate `3 files, 70 tests passed`, merged61d29c1f. Narrow package types, owning tests and library/UI checks passed above; no full sweep repeated at merge.
- Validation: downstream task finish -> structure gate passed and mergedfa99782d; final backup push and local merged-branch cleanup passed after resolving an upstream-tip lag. Remote task backups retained.
- Validation: `git log -1 --oneline` in both repositories -> paired merge commits confirmed.
- Not verified: main promotion or paid/browser Claude quality; existing supervised-launch requirements remain.
