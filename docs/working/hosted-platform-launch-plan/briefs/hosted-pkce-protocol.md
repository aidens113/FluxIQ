# Fixed-client hosted PKCE protocol
Role: Heavy worker, gpt-6.1-sol max; retain configured worker if followup cannot override.
Goal: Build provider-free-testable PKCE initiation/return/exchange protocol for the extension; no background activation yet.
Own: extension apps/extension/src/background/connect/pkce/** (new); Core report hosted-pkce-protocol.md.
Must not touch: credentials/authentication-tabs implementations, connection/session/outbox/background composition, panel/shared, Core source/contracts, package files, shared docs, dist, git.
Read: extension-hosted-connect-discovery report; current contract connect/discovery schemas; credentials binding/model and authentication-tabs public model; extension AGENTS/CODEX relevant boundary rules.
Before editing propose a narrow injected-port API, state transitions and worker-restart policy. Wait for root API approval.
Use fixed client_id fluxiq-browser-extension, per-binding repository installId, explicit nonsecret label, independent32-byte random state/verifier and SHA256 challenge. Use actual contract schemas and URL constructor.
Pin checked binding and fresh discovery capabilities: require PKCE=true, exact actual transport protocol supported and extension minimum version satisfied. No tokenless hosted fallback or typed-reference FlowB.
Only privileged injected fetch/tab/session ports. No actual network/browser/global storage in tests. Never receive panel cookies/passwords or put secrets in status/log/diagnostics/activity.
Owned tab must be created blank, claimed/excluded durably before navigating to authorize. Abort if claiming fails. Exact callback tab/origin/path, empty query, exact saved state and strict fragment schema. Wrong/cancelled/late callback never activates.
Submit token POST once, credentials omit, redirects error, cache no-store, referrer no-referrer, fixed fluxiq-client/content-type headers. Unknown bodies/errors become safe fixed outcomes; no raw body/cause leaks.
No automatic retry after ambiguous token POST failure. Validate real success against pinned gateway and owner schema/expiry; no invented TTL or account. A delivered credential not adopted because cancel/server switch requires a private revocation intent.
Propose but do not improvise durable attempt storage: it must be privileged session-scoped, store only what recovery needs, distinguish waiting versus exchange already started, and never retry exchange after worker restart. Unknown/new browser-session restored tabs remain excluded by existing policy until safely resolved.
Expose result to owning background only; commit new trust via supplied repository before caller may hello. Normal rotation stays with transport adapter. Current-selection guard before/after awaits; one exchange winner despite duplicate navigation callbacks.
Acceptance: fixed PKCE vector and entropy, exact endpoints/headers/body, malformed/duplicate/mixed return fields, wrong tab/origin/state, deny, cancel/switch at each await, ambiguous exchange, storage failure, expired/mismatched response, no secret in public outcome, returned but unadopted proof cleanup.
Keep API small and existing local connection untouched. Detailed composition/privacy policy is a separate unit, not claimed complete here.
Run filtered extension tests under unique label and scoped types only on root-approved stable dependencies. No full suite/build/live actions.
Return Outcome/Changed/Validation/Not verified/Report/Notes plus source-frozen signal.
