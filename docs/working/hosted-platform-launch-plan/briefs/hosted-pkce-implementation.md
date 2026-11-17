# Controlled-tab hosted PKCE protocol
Role: Heavy worker, gpt-6.1-sol max; retain configured worker on followup.
Goal: Implement approved injected-port protocol; production background activation is a separate unit.
Own: downstream apps/extension/src/background/connect/pkce/** (new), background/authentication-tabs/registry.ts and its tests; own Core hosted-pkce-protocol.md report.
Must not touch: credentials, transport adapter, connection/session/outbox composition, content/MAIN scripts, panel/UI, Core sources, package files, shared docs, git or dist.
Read: hosted-pkce-protocol.md proposal and earlier brief; existing credential and auth-tab public APIs, actual connect/discovery contracts; paired Current State.
Decision: native API rejected as privacy boundary after real Chrome injection/capture; use controlled inactive blank tab, durable claim before navigation. No native callback allowlist/Core change.
Add synchronous owns(tabId,attemptId):boolean only true when ready and exact durably committed owner. Never infer from eligible=false or pending reservation. Add sessionIdentity():string|null only when ready; no mutable internals exposed.
Implement proposal's immutable selection/binding, fresh discovery, strict actual schemas, independent state/verifier, S256, exact same-origin /connect/done, one exchange CAS, credential adoption and cancellation cleanup.
Existing primary origin callback contract remains unchanged; no external redirects/wildcards. A current-generation guard surrounds adoption awaits.
Approve injected attempt CAS port from proposal, not a browser storage backend yet. Preparing/waiting hold state/verifier; exchanging durably removes them before POST. No callback code persisted. No retry after ambiguous exchange/restart.
Return closed safe phases/errors only. No secrets, authorize URLs, raw response or error causes in public outcomes/logging.
Use actual private repository seam where possible; callback return alone never marks connected, commit trust first. Cancelled delivered proof journals original audience revocation; never revokes newer trust.
Keep auth tab excluded after terminal; protocol never guesses close/release safety. Parent privacy/capture barrier remains required before activation.
No browser launch/network/global storage/model/provider/build or full suite. Dependencies already built; package public contracts unchanged.
Acceptance: existing auth-tab tests plus exact ownership before/after save/failure/restart; fixed PKCE vector; all listed proposal duplicate/foreign callback, cancel/switch, one-exchange, failure/recovery/cleanup tests.
Use uniquely labelled filtered extension test runner and scoped types; first inspect documented command. Report source freeze and exact observed commands/results.
Finish native probe report first, then execute this brief; root owns shared working ledger. Return Outcome/Changed/Validation/Not verified/Report/Notes.
