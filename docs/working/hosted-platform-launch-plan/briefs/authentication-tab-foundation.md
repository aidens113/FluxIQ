# Authentication-tab registry foundation
Role: Standard worker, gpt-6.1-sol medium; keep existing configured worker.
Goal: Build a session-scoped registry/policy for tabs used by hosted authentication, before wiring PKCE.
Roots: paired t914 Core and !FluxIQWebExtension.
Own only: extension apps/extension/src/background/authentication-tabs/** (new module/tests); Core report authentication-tab-foundation.md.
Must not touch: credentials module, existing background/runtime/panel/shared composition, package files, Core source/contracts, docs shared state, dist, git.
Read: extension-hosted-connect-discovery report tab/restore requirements; existing extension tabs/storage APIs enough for compatible injectable ports.
First send proposed API/lifecycle before implementing. Expose readiness/hydration barrier, own/release tab for attempt, eligibility(snapshot tab id+url), and configured known Core auth/return/signup route exclusion.
All automation admission must eventually await hydration; this foundation provides no unsafe allow while not ready/storage failed.
An owned auth tab remains excluded through off-origin login/signup navigation, regardless of URL. Startup ownership must be bound to browser session, not permanent tab ids; a new browser session discards old ownership, never claims guessed restored tab IDs.
Use privileged browser-session storage adapter/injectable port; no local/sync durable auth ownership or secret fallback. Do not store codes, state, verifier, cookies, user/password/credential or full authorize fragments.
Policy for known routes must use parsed exact origins/path boundaries, not substring host checks. Do not block arbitrary normal websites just because query/fragment contains login/connect.
Keep tab operations outside this pure registry (do not close/navigate tabs here). Later composition registers blank owned tab before navigation and excludes explicit target IDs as well as list metadata.
Provider-free tests: slow hydration refusal, restart in same session, new-browser-session old tab id refusal-to-own, owned tab offorigin, release only exact attempt, ID reuse with mismatched attempt, storage rejection, route lookalikes and ordinary tabs usable.
No browser/server/provider; no builds/dist mutation. Existing filtered runner only after root fresh signal, unique build label.
Report unwired limitation and actual browser restoration/privacy still unverified. Return Outcome/Changed/Validation/Not verified/Report/Notes.
