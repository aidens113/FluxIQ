# Extension approved-client experience
Role: standard worker, gpt-6.1-sol, medium; no delegation/git/shared-document edits.
Goal: remove model-key unlock ceremony from extension, preserve real authentication and configuration.
Root: C:/Users/osrs_/FluxStuff/fxwork/t914/!FluxIQWebExtension.
Read: paired Core Current State and reports/client-lock-ui-discovery.md partition4; extension instructions.
Own: apps/extension/src files enumerated in report partition4 and adjacent tests only.
Must not touch: Core, domain, acceptance harness, docs except own Core report client-access-extension-implementation.md.
Frozen wire key.availability: {state:"available"} | {state:"unavailable",code:"legacy_recovery_required"|"host_protection_unavailable"|"ciphertext_invalid"}; safe type/parser will export via fluxiq/ui.
Missing legacy metadata retains prior enabled-key behavior; explicit old unlocked:false means unavailable/upgrade, not ready or another unlock prompt.
Remove unlockTicket request/dependency and #unlock= URL. model-key purpose opens ordinary keys config directly.
Remove sixth unlock step and locked-state/password prose. Distinguish configured/unavailable/read failure from connection state.
Relay availability consistently, never secret material. Custom enabled keys aren't LLM readiness.
No missing model-key gate on connection or deterministic replay; normal sign-in/connect/approve remain.
Update tests per report; no weakening backend assumptions by just hiding fields.
No builds while Core libraries moving; prepare code/tests then ask lead for dependency rebuild before filtered extension tests.
Report exact changed paths, checks, integration needs. No browser/server/model calls.
