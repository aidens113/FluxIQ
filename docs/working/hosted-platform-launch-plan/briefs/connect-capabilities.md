# Explicit connect flow discovery

- Role: heavy worker, gpt-6.1-sol, max. No agents/git.
- Goal: advertise implemented connection flows explicitly, preserving discovery v1 compatibility.
- Own: packages/contracts/src/platform/discovery/**; apps/web/src/app/api/discovery/build-discovery-document.ts and its owning discovery tests; own reports/connect-capabilities.md.
- Read Current State and your extension-connect-discovery report, then exact schema/builder/tests.
- Must not touch Core program-route or other Core packages, downstream, shared docs, other reports, runtime data/build output.
- Frozen additive contract: optional connect.flows object with required booleans authorizationCodePkce and referenceCode. Missing object means legacy/unknown, not support inferred from URLs.
- New server always emits both flags: authorizationCodePkce true only for service profile with gateway.enabled; referenceCode false. Preserve required existing URL fields and protocol version.
- Existing v1 documents still parse; new documents retain flags; malformed flags fail validation. Bound origin/endpoint checks remain unchanged.
- Tests: legacy missing flows, exact supported flags by local/self-hosted/service enabled/disabled, malformed flags, existing foreign-origin rejection unchanged.
- Run owning contract tests only now; coordinate stable source signal with lead before any shared build or web test. Lead is integrating HTTP and will rebuild once Core editors settle.
- No actual browser/server/provider calls. End with Outcome/Changed/Validation/Not verified/Report/Notes.
