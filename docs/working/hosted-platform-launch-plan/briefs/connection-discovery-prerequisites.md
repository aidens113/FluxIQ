# Explicit connection discovery capabilities
Role: Standard worker, gpt-6.1-sol medium; keep existing configured worker.
Goal: Complete two discovery prerequisites for hosted extension adoption without changing auth protocol.
Own: packages/contracts/src/platform/discovery/discovery-document.ts + adjacent discovery tests; apps/web/src/app/api/discovery/build-discovery-document.ts + discovery tests; report connection-discovery-prerequisites.md.
Must not touch: transport, extension, app contracts, IAM, other web routes, shared docs, dist, package files, git.
Read: extension-hosted-connect-discovery report; discovery source/tests; existing deployment settings/manifest only as needed.
Add optional boolean connect.flows.gatewayReferencePairing (missing means unknown). It means existing tokenless gateway hello/local reference approval, NOT unimplemented typed Flow B referenceCode.
Builder advertises true only for local/self-hosted with gateway enabled; service always false. Existing referenceCode stays false. Existing PKCE service/gateway gate unchanged.
Service discovery must refuse missing/blank FLUXIQ_INSTANCE_ID with safe field instance.id, preserving configured id validation. Local/self-hosted may still omit it. Do not generate guessed/random ephemeral id or use artifact identity.
Keep protocol versions/min client/unknown-additive field handling compatible. Service schema parsing may retain optional instance.id for legacy discovery; current service builder enforces rollout requirement.
Tests: all profile/enabled combinations, absent optional capability parses legacy, malformed capability rejected, service missing/blank ID refuses, stable configured ID unchanged across builds, no raw env values in failure.
No build/dist changes. Contract source tests may run; guarded web tests need root combined rebuild after your source freeze. Do source-local type/probe if useful.
Return Outcome/Changed/Validation/Not verified/Report/Notes; freeze source promptly for coordinated build.
