# Dedicated framework and recording routes
Role: Standard worker, gpt-6.1-sol medium; keep current configured model.
Goal: Migrate next buffered routes to your frozen workspaceRouteContext/withWorkspaceRouteJson API.
Own: apps/web/src/app/api/framework/io/route.ts, io/validate/route.ts and adjacent tests; apps/web/src/app/api/recordings/route.ts and recordings/tests/**; report tenant-framework-recordings.md.
Must not touch: adapter source, setup route, other routes/lib, Core/packages, shared docs, dist, git.
Read: tenant-route-completion-discovery.md B lane and frozen adapter; current route implementations/tests and IAM contracts.
Framework IO/validate are panel-only; preserve existing service ops:* denial. Host setup is intentionally untouched.
Recordings supports panel or paired; selected context must freeze domain and pairing identity. Preserve pagination and output contract.
No bearer-first fallback: selected nonempty panel cookie remains panel, including invalid cookie refusal.
Recheck authority after request body awaits; responses fully buffered under tenant lease, release exactly once.
Tests use actual tenant registry/current primary identity where appropriate, tenants A/B, mixed credentials, revoked/changed membership across body read, existing local behavior and service ops denial.
Do not mock away the selector contract. Use existing route tests to preserve behavior.
No builds/dist mutation. Guarded web tests wait for root fresh Core/UI signal. You may author now while Core acceptance completes; report source stable when ready.
Include original adapter tests in eventual narrow run; report what is unverified.
Return Outcome/Changed/Validation/Not verified/Report/Notes.

Ownership expanded: apps/web/src/app/api/tests/app-route-fixture.ts and app-route-iam-parity.test.ts. Adapt actual request cookies/leases/clientType; only migrated programs/io/io-validate unsupported paired rows become403. Keep all other route expectations unchanged. Include IAM parity/service matrices in focused verification.
