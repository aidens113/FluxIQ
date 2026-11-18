# Authentication-tab privacy composition discovery
Role: Heavy worker, gpt-6.1-sol max; retain current configured worker.
Goal: Identify every existing extension automation/state/recording/capture entry that must exclude owned authentication tabs; propose smallest central policy wiring.
Own: Core docs/working/hosted-platform-launch-plan/reports/authentication-tab-integration.md only; no source edits.
Read extension-hosted-connect-discovery and authentication-tab-foundation reports; extension background/authentication-tabs public API; inspect only the tab admission, browser-state/snapshot, recorder/navigation, explicit action/capture and trace seams needed.
Do not edit existing Core/web/extension source, tests, shared docs, credentials/PKCE units, package files, dist or git. No browser/server/provider calls or builds.
Produce exact paths, public adapter signatures, current data leakage routes, ownership split and provider-free tests for the next unit.
AuthenticationTabs registry already exists; do not invent a second store/policy. Own before navigate. Exact owned-tab exclusion must survive navigation to signup/external origin and restoration within the same browser session.
All data projections and explicit-target execution must use the same decision, before reading/capturing/serializing/acting. Check incremental state and onScreen.pageUrl, not just tab lists. Avoid blanket excluding all ordinary Core-site pages unless exact auth route policy says so.
Known routes are fallback; stored ownership is authoritative. URL query/fragment must never determine trust or be logged. Unowned ordinary tabs remain eligible under their existing general scheme policy.
Do not make fully local mode require privileged hosted-signin APIs if hosted signin is unused. When auth is active, uncertain ownership/storage must fail closed; explain startup/default registry policy.
Identify session outbox/profile/recording state that must be reset when switching owner/workspace/lineage versus retained on normal rotation; existing loss accounting must survive.
Keep the plan concrete; no broad rewritten architecture or code dump. Reference exact existing seams and baseline behavior. Root owns integration/acceptance.
Return Outcome/Changed/Validation/Not verified/Report/Notes.
