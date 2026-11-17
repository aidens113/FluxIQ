# Authentication privacy authority
Role: Heavy worker, existing browser_trust configuration.
Goal: Implement P1 injected privacy authority and durable restoration-risk foundation; no consumer or PKCE activation.
Own: downstream shared/tab-access/**, background/authentication-privacy/**, background/authentication-tabs/** and adjacent tests; Core report authentication-privacy.md only.
Must not touch: entry/connection facades, credentials/PKCE/attempt store, content/MAIN, capture/runtime/panel consumers, Core source, packages/dist/git/shared documents.
Read: hosted-connect-activation report, actual auth-tab registry/store/routes and pushed PKCE tab port.
First freeze: exact opaque AutomationTabAccess leases/data-free admission messages, auth-launch/capture ports and closed risk schema. Send API before sibling dispatch.
Implement: synchronous generation invalidation/exclusion before awaits; exact browser-session/document/connection-owner leases; ID-first refusal without reading excluded title/URL; trusted route replacement; global capture block/drain and durable risk before launch.
Use injected ports. This owner creates/navigates no browser tab and performs no screenshot. Auth launch permit requires old captures drained before any auth surface can be navigated.
Persist private nonsecret risk with no fallback that clears uncertainty. A proved-clear never-used local path retains ordinary behavior. Actual unresolved restoration risk admits only internally proven newly-created ordinary tabs; do not guess recycled or restored IDs.
Owned/reserved/uncertain auth surfaces block visible capture globally. Other admitted ordinary DOM/action/model/transport use continues. Never introduce default client/key lock, unlock prompt or panel-session dependency.
Risk stays until proved surface cleanup including children; token completion/cancel alone cannot clear it. Expose safe explicit unavailable result, no sensitive metadata.
Acceptance: P1 tests from report, existing registry/attempt/PKCE regressions; scoped types/structure with stable libraries. No builds/full suites/browser/network/provider operations.
Return source freeze, exact API/lifecycle/crash ordering, observed checks, unverified consumer/browser integration and standard contract.
