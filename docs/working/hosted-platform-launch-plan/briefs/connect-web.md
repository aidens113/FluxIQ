# Hosted consent and token routes

- Role: heavy worker, gpt-6.1-sol, max. No agents/git.
- Goal: wire existing PKCE connect contracts into actual authenticated consent pages and bounded public token exchange, using the root-owned server composition.
- Own: NEW apps/web/src/features/connect/**, app/connect/**, app/api/connect/** and own reports/connect-web.md. Identify middleware/route-policy edits needed before touching existing files outside these paths.
- Read Current State, reports/browser-binding-discovery.md connect sections, contracts/platform/connect/**, existing sign-in/welcome/account page+route conventions and middleware guards as needed.
- Must not touch: server/connect/** (lead), lib/workspaces/**, lib/fluxiq.ts, Core packages, shared docs, other reports/repos.
- Frozen integration: server/connect barrel exports getConnectService():Promise<ConnectService> and validateConnectApproval(sessionDigest). Service.authorize(request:unknown, digest)->{ok:true,authorization:{code,state,redirectUri,expiresAt}} or {ok:false,error}; service.exchange(request:unknown)->{ok:true,response} or {ok:false,error}; unexpected failures sanitized, never log payload.
- All hosted connect entrypoints currently service-profile only; preserve local/self-hosted existing pairing. Do not advertise a working local connect flow if it is unavailable.
- GET authorize shows real consent only; never authorizes on page view. Authenticate using actual panel cookie, hash to SHA256 digest server-side, and check live approval. POST consent must enforce exact Origin/CSRF protection; no actor/workspace accepted from form.
- Validate the full existing query/form contract and exact same-origin redirect. Authorization code goes only into the existing done-fragment contract, never a query, log, analytics or referrer.
- Token endpoint is public PKCE, bounded JSON/body, no cookie fallback, explicit admission policy and no-store. Never return exception messages that could contain credential/DB data.
- Done page must implement the contracts' handoff safely (exact origin/source, no wildcard postMessage, no token persistence); report downstream extension dependencies honestly.
- No fake consent completion, reference-code path or revoke success without real work. If the advertised revoke path needs unavailable root service support, report exact required port early; root owns authority/revocation.
- Use established app components/styles/accessibility; this is a focused existing-product auth flow, not a marketing site or plugin publication. No external calls or live server startup.
- Tests: consent never on GET, login/refusal, mismatched Origin/redirect, invalid PKCE/body, code fragment not query, no-store/error redaction; existing middleware boundary synchronized with lead.
- Web tests refuse stale Core builds: author tests now; wait for lead rebuilt-library signal before running. Report exact tests/skips and API requests.
- End with standard Outcome/Changed/Validation/Not verified/Report/Notes.
