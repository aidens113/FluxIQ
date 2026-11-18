# Shared UI and web client-lock removal
Role: standard worker, gpt-6.1-sol, medium; no delegation/git/shared-document edits.
Goal: remove the complete second-unlock UI while showing actual model configuration/availability.
Read: Current State; reports/client-lock-ui-discovery.md partitions2/3; authenticated-client-access decision/wire.
Own: packages/ui-components/src/** relevant paths in partition2 and adjacent tests; apps/web/src/features/security/** relevant partition3 paths/tests; features/chat-widget/transport/models-port.ts + adjacent/transport tests; app/GlobalClientGatewayPairing.tsx and tests; app/layout.tsx only removed prop.
Must not touch: backend, contracts, web API routes, extension, other docs/reports.
Report: reports/client-access-ui-implementation.md.
Frozen wire: key.availability = ModelKeyAvailability ({state:"available"} | {state:"unavailable",code:"legacy_recovery_required"|"host_protection_unavailable"|"ciphertext_invalid"}).
Lead adds readModelKeyAvailability and type export to fluxiq/ui. Legacy missing metadata can retain legacy enabled-key behavior, but explicit unlocked:false means unavailable/upgrade required, never ready or password prompt.
Require enabled llm key/provider compatibility, not any enabled custom key. Preserve truthful unknown/malformed status.
Remove unlock/password/TOTP approval fields and ticket/hash/dialog/client chooser roundtrip. Approval success {session}; no unlocked field.
Keep privileged reveal/create/delete authorization; only remove extra client model-key ceremony.
Do not disable deterministic replay/composer merely due to model setup missing. Preserve ordinary authentication and revoke.
Historical model_key_locked remains readable with neutral unavailable/recheck wording; no active unlock CTA.
Web adapter must preserve availability like extension; no status stripping.
Run narrow UI/web tests when source stable; no builds/whole suite/server/paid calls.
Send needs outside owned files to lead; do not silently weaken tests.
