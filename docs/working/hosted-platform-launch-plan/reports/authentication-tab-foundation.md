# Authentication-tab registry foundation

Outcome: Done (bounded foundation implemented and independently runnable checks passed; lead integration/acceptance remains). Only the new extension `apps/extension/src/background/authentication-tabs/**` subtree and this report were edited. Existing background/runtime/panel/shared composition, credentials, Core source/contracts, package files, shared docs, product build/dist and git were untouched. Source is frozen.

## Approved API and lifecycle

Import from `apps/extension/src/background/authentication-tabs/index.ts`:

```ts
const tabs = new AuthenticationTabs({ store, routes });
await tabs.ready();
tabs.status(); // loading | ready | failed
await tabs.own(tabId, attemptId);
await tabs.release(tabId, attemptId); // false when exact owner does not match
tabs.eligible({ tabId, url });
```

`browserSessionAuthenticationTabStore(area?, mintSessionId?)` supplies the production browser-session adapter or accepts a narrow injectable area. `AuthenticationTabRoutePolicy(routes)` is independently testable; `AuthenticationTabsError` exposes fixed safe text/codes. Narrow owner, session-store/area, route, snapshot and constructor-option types are exported by the same barrel. The store `load()` returns `{ browserSessionId, ownership: unknown }`; `save()` accepts only the private versioned ownership envelope.

- Constructor starts hydration. Eligibility is false while loading or after any storage/state failure; readiness rejects with a sanitized error. Startup observes the original hydration promise without leaving an unhandled rejection. Callers must still await readiness and apply eligibility for every admission, including explicit target ids.
- Claiming reserves exclusion synchronously, persists before resolving and remains excluded on blank/Core/signup/arbitrary off-origin navigation. Only `{tabId,attemptId}` is retained, never tab URL/title, state, verifier, code, cookies, passwords or credentials. Different attempts cannot overwrite an owned id; same owner claim is idempotent. Exact-attempt release remains excluded until its storage commit succeeds. Mutations serialize.
- Ownership restores only when its browser-session marker matches. A different browser session discards old ids and persists an empty current-session envelope before readiness; it never claims a guessed restored tab. The adapter reads/rechecks the current marker before saving so stale registry writes after a session change fail closed.
- Known routes use parsed canonical origins and exact path matching, with an explicit descendant option and path-segment boundaries. Query/fragment text never creates a match; host/path lookalikes and ordinary sites stay usable. Encoded route characters are compared after path decoding. This is authentication exclusion only: unowned `about:blank` and other parseable schemes remain available to the caller's existing general page eligibility policy. Missing/malformed URLs refuse.
- The adapter uses only privileged `storage.session`, awaits `setAccessLevel(TRUSTED_CONTEXTS)` where offered, and rejects missing API/access/read/write failures without local/sync or memory fallback. Session initialization/storage operations are serialized within the background; a session marker is minted only there, never from a permanent tab id. Stored records are strictly parsed/rebuilt from allowlisted fields.

## Files and authored checks

New source files: `registry.ts`, `session-store.ts`, `route-policy.ts`, `model.ts`, `failure.ts`, `identifier.ts`, `read-ownership.ts`, `index.ts`. Adjacent tests: `tests/{registry,session-store,route-policy}.test.ts` and `fixture.ts`.

Authored provider-free cases cover slow hydration; same-session worker restart; new-browser-session stale-id refusal to own; owned off-origin/blank tabs; exact release and reused id with mismatched attempt; concurrent claim/release ordering; storage rejection and sanitized errors; malformed/secret-bearing private records; session marker change; awaited trusted-only access and missing session API; route origin/path lookalikes, descendants, query/fragment, encoded path and ordinary `about:blank`.

The lead verified this subtree's import graph uses only its own modules plus Node test/assert, and explicitly authorized its filtered runner/source-local checks during Core rebuild. No Core dist dependency or freshness guard was bypassed. Observed checks:

- From extension package, `$env:EXTENSION_TEST_BUILD_LABEL = 't914-auth-tabs-foundation'; node scripts/test-extension.mjs background/authentication-tabs/tests` → **60 tests passed, 0 failed**. Only selected entries were bundled into the ignored, label-owned `.test-build-scratch/t914-auth-tabs-foundation/background/authentication-tabs/tests/` directory; no product bundle/dist was built.
- From extension package, `$authTabFiles = @(rg --files src/background/authentication-tabs -g '*.ts'); pnpm.cmd exec tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --module ESNext --moduleResolution Bundler --target ES2022 --lib 'ES2022,DOM,DOM.Iterable' --types 'node,chrome' --skipLibCheck $authTabFiles` → **exit 0**, including the owned tests.
- `node scripts/structure-audit.mjs` → first audit completed with **two violations**: one owned statement-packing line in the session-store test fallback mock, plus stale shared `docs/working/README.md` outside ownership. The test line was split without behavior change. `node scripts/structure-audit.mjs --rule statement-packing` → **passed, 0 warnings, 347 baselined**. The lead was informed of the shared index finding and owns regeneration/full acceptance; no baseline was changed.
- `git diff --check -- apps/extension/src/background/authentication-tabs` → **exit 0**. Source review found no tab operations, fetch, logs or durable local/sync ownership storage. Broad extension checks remain held for coordinated fresh Core dependencies.

## Boundaries and unverified behavior

This registry is deliberately unwired. Existing tab enumeration, onScreen URLs, content/event intake, recording, DOM/trace evidence and runtime commands do not yet consult it. The lead's later composition must register an inactive blank auth tab before navigation, await hydration at every admission, configure known Core auth/return/signup routes, and release the exact attempt on trusted lifecycle events. This unit makes no claim that existing automation already excludes authentication tabs.

One background-owned registry is the authority; its mutation queue is not a multi-writer transactional database. The adapter's session-marker recheck is not cross-process compare-and-swap. Actual browser worker/reload/restart ordering, content-script isolation and restored arbitrary external auth destinations remain unverified. A new session cannot safely identify an arbitrary external restored tab from an old numerical id; only configured known routes are classifiable without current ownership evidence. Browser tab operations and any later recovery policy stay outside this module.

Chrome documents session storage as cleared on browser restart and also extension disable/reload/update; Mozilla documents browser-session lifetime and default content-script exclusion. These API guarantees motivated the adapter and do not prove actual browser privacy behavior. Sources: [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage), [Mozilla storage.session](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session).

Outcome: Done
Changed: New extension authentication-tabs subtree plus this report.
Validation: Filtered tests → 60/60 passed; strict subtree types and scoped diff → exit 0; statement-packing rule → passed.
Not verified: Independent lead rerun, shared working-index/full audit acceptance, broad extension checks, composition, actual browser restoration/privacy, browser/provider runs.
Report: `docs/working/hosted-platform-launch-plan/reports/authentication-tab-foundation.md`
Notes: API approved by lead. No general scheme policy/default auth lock introduced. Source frozen for checks.
