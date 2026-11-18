# Hosted browser consent and public proof routes

Outcome: Done for the owned web pages, handlers and route-policy unit. Live browser/downstream extension acceptance is not claimed.

## Implemented entrypoints

- `GET /connect/authorize`: validates the full existing query contract, including exact configured same-origin done redirect and exactly one occurrence of every required parameter. Signed out, it mounts the established sign-in UI and optional configured HTTPS account-creation link with the same local authorize path as `continue`. With a live approved session, it shows the actual browser label, person and workspace. It never calls `service.authorize` on view.
- `POST /api/connect/authorize`: accepts an explicitly approved or declined URL-encoded form. It requires exact configured Origin, same-origin fetch evidence when present, the actual session cookie, an HMAC bound to the displayed request and that HttpOnly cookie, and the lead-owned tenant/self-user IAM decision. The form cannot choose an actor or workspace.
- `GET /connect/done`: renders the contract's handoff status without exposing its code. The code exists only in the redirect fragment, never a query, server-rendered body, DOM text, storage, log or message channel.
- `GET /connect`: tells the person to start from the extension and explicitly states that typed pairing codes are unavailable. It does not pretend to implement the missing reference-code service.
- `POST /api/connect/token`: admits an explicit public extension request, bounds JSON bytes while streaming, validates the existing complete PKCE request schema and exchanges through the real root-composed service.
- `POST /api/connect/revoke`: validates and bounds the same public request boundary and calls the actual root revocation port. A processed valid or invalid credential receives `200 {}`; operational failures receive a redacted 503 rather than fake success.

All hosted handlers are service-profile-only. Local/self-hosted views explain the existing panel pairing path; hosted proof APIs return unavailable rather than pretending local hosted connect works.

## Consent and authority

The GET hashes the actual panel cookie with SHA-256 server-side and calls `validateConnectApproval` for current account/session/workspace eligibility. No raw cookie is returned or persisted.
The form evidence is HMAC-SHA256, keyed by that HttpOnly cookie, over a domain-separated canonical full authorize request. This binds the approved fields to the displayed request and current session; it is a CSRF/parameter-integrity token, not a new client credential scheme.
POST independently requires exact Origin even if middleware's legacy Bearer/cookie handling would otherwise pass a request. Changed install, label, challenge, state, cookie or evidence refuses before issuing.
The lead's `authorizeConnectConsent(rawSessionId)` validates the actual primary identity, selects and leases the approved tenant, and performs `gateway:ApprovePairing` on the caller's own user under tenant IAM. This worker calls that port; no primary-workspace fallback or request-supplied actor is used.
Only an explicit approved POST reaches `getConnectService().authorize`. Decline returns `access_denied` with the original state and issues nothing. A service refusal returns the existing safe `server_error` fragment. Returned code/state/redirect are checked before redirecting.

## Public API admission and failures

The required admission header is `fluxiq-client: browser-extension`. It conveys no trust; the full S256 code/verifier proof remains mandatory.
Missing Origin is accepted only with that explicit header. A present Origin must be the configured exact panel origin, or an extension origin admitted by the existing configured gateway Origin rules. Other web origins, `null` and unlisted extension origins refuse.
These APIs use no panel-cookie fallback and set no cookie. Their bodies must be JSON and no more than 8 KiB, enforced while reading even with missing or dishonest `content-length`. Malformed UTF-8/JSON and invalid PKCE shapes refuse before opening code authority.
Success output is parsed through the existing token response schema. Fixed OAuth errors retain the documented status mapping; free-form descriptions are not echoed. Unexpected service/storage/issuer/revocation failures and malformed service output produce `{ error: "temporarily_unavailable" }` with 503 and no internal exception message. The lead added that error to the shared contract.

## Privacy and handoff

Narrow middleware headers cover `/connect`, `/connect/*` and `/api/connect/*`: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, frame denial, nosniff and a same-origin resource CSP. Existing cookie Origin guards remain unchanged. The CSP prevents third-party resources on connection pages; no analytics/message handoff was added.
The authoritative Flow A protocol uses the extension's own tab URL observer. The done page retains the valid fragment until the extension receives it; clearing it immediately could race that observer. It neither posts a code to an opener nor accepts a message. It says to return to the extension to finish, rather than claiming token exchange completed.
The extension still must verify exact origin, owned tab and its own state, exchange the code with its saved verifier/install id, persist the returned credential through its established storage and close its own tab. That downstream work was not implemented or verified by this worker. It must include the explicit client header above and obey the token/revoke Origin admission policy.

## Route-policy synchronization

Lead explicitly granted these existing files in addition to the new connect subtrees:

- `apps/web/src/middleware.ts` and `src/tests/middleware.test.ts`: privacy headers only; no authentication exemption.
- `apps/web/src/lib/app-route-iam/{contracts,types}.ts` and its `tests/contracts.test.ts`: consent is panel-only self-user `gateway:ApprovePairing`; API key management is panel-only self-user `iam:ListApiKeys`, `iam:EnrollApiKey`, `iam:RevokeApiKey` for GET/POST/DELETE.

The scanner now recognizes exported const method aliases, covering the existing key route. Only exact `POST /api/keys/session`, `POST /api/connect/token`, and `POST /api/connect/revoke` are classified as public proof endpoints. Existing login/discovery classification remains. The lead owns actual key-management IAM enforcement and the ordinary-user policy grants.

## Validation

Waited for the lead's fresh Core contracts/fluxiq build signal before running web tests; no stale-build override was used.

`pnpm.cmd exec vitest run src/features/connect src/app/connect src/app/api/connect src/tests/middleware.test.ts src/lib/app-route-iam/tests/contracts.test.ts` in `apps/web` -> **57 passed in 8 files**.

The focused tests call the actual mounted API handlers and cover GET-without-issuance, sign-in/refusal, exact redirect and duplicate parameters, form/cookie/field binding, exact Origin and IAM denial, decline, code fragment-only redirects, malformed and oversized streaming payloads, public extension origin admission, invalid PKCE, fixed errors/redaction, true revocation versus operational failure, private done rendering, no message/storage side effects and synchronized IAM/middleware boundaries.
The client rendering test emits the repository's existing react-test-renderer deprecation notice; it passes.

Owner-scoped existing structure audit with its ratchet and 15 source/import/test-placement rules -> **43 files, 0 failures**. Its initial failure caught a malformed signup URL being treated as an absent link; that path now fails closed through the page's unavailable response, and the final audit passes.
Lead integrated web typecheck is pending; no separate full package/build sweep was run by this worker.

No live browser/tab observer, real HTTP server headers, external signup service, real account mutation, email, provider or paid service was exercised. Discovery still publishes the pre-existing connect shape for profiles without hosted connect; the new handlers honestly refuse those profiles, but discovery availability semantics and typed-code fallback remain separate integration work.

## Read-only discovery follow-up requested by lead

`apps/web/src/app/api/discovery/build-discovery-document.ts` emits all four connect paths for every profile. `packages/contracts/src/platform/discovery/discovery-document.ts` requires `authorizeUrl`, `tokenUrl`, `revokeUrl` and `codeEntryUrl`, so omitting or nulling them would break the existing v1 schema.
The existing `instance.profile` distinguishes deployment type but cannot describe which connect flows actually work: even service's `codeEntryUrl` currently leads to instructions rather than a reference-code implementation.

Recommended smallest additive contract change is an optional `connect.flows` object with `authorizationCodePkce: boolean` and `referenceCode: boolean`. New servers would always publish `{ authorizationCodePkce: settings.profile === "service" && settings.gateway.enabled, referenceCode: false }`. Required URL paths remain endpoint locations, not availability claims.
New clients should begin only an explicitly supported flow; absent flags mean unknown/legacy, rather than inferring availability from a URL. Older v1 parsers already drop unknown object fields and can still parse the unchanged required paths, so this does not require a discovery version bump.
Follow-up ownership is the Core discovery schema/tests, web discovery builder/tests, authored protocol docs and downstream consumer. This was read-only investigation; no Core/discovery source changed during the lead's typecheck hold.

Outcome: Done
Changed: apps/web/src/features/connect/**; app/connect/**; app/api/connect/**; approved middleware/IAM files above; this report.
Validation: focused web command -> 57 passed; scoped structure audit -> 43 files, 0 failures.
Not verified: Lead integrated typecheck, live browser/downstream tab+state observation, real HTTP headers, real signup/consent sessions, local discovery availability and typed-code fallback.
Report: docs/working/hosted-platform-launch-plan/reports/connect-web.md
Notes: No Core/server-connect/workspace/runtime/git changes. No cookie fallback or actor/workspace form authority. New API client header and downstream extension work are explicit dependencies.
