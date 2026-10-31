# Claude Live Provider Plan

Status: Active
Status detail: Implementing paired t816; Anthropic is listed in Secret Keys UI, but runtime resolution and live Lab routing are DeepSeek-only.
Created: 2026-10-30
Last updated: 2026-10-30
Owner: Senior supervisor agent
Scope: Use CLAUDE_API_KEY for all live tests; implement real Claude provider, encrypted-key routing and model selection in Core, and provider-aware credential/default/accounting paths in the Lab.
Paired document: ../!FluxIQWebExtension/docs/working/claude-live-provider-plan.md
Related: [Framework continuation](framework-heavy-lifting-plan.md)

## Current State

The user requested Claude for every live model-backed test and explicitly asked that preference be recorded.
Both repositories' AGENTS.md now hold it. Never silently fall back to DeepSeek. Provider-free tests remain provider-free.
CLAUDE_API_KEY is present in the main downstream .env.local; its value was not printed, copied or committed.
Anthropic appears in the keys UI, but Core's provider factory/session resolver and Lab credential/plan paths support only DeepSeek.
Paired task t816 owns implementation in isolated checkouts. The lead owns downstream paths; a heavy worker owns Core.
Live default: claude-sonnet-5-5, provider anthropic, selected for agentic task quality and speed; explicit model selection remains available.
The user raised Claude live tests to $5 per build on 2026-10-30. The Lab injects this test-scoped ceiling; normal
product defaults remain separate, and native output limits are never reduced to save money.
Keep identical realistic task instructions/oracles and record model, verdict, calls, provider-reported usage/cost and runtime.
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
