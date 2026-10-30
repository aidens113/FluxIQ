# Security Policy

## Supported Code

Security fixes target the latest published FluxIQ release and the current
default branch. Older development snapshots are not maintained as separate
security branches.

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities in a public issue. Use the
repository's private GitHub Security Advisory reporting flow. If private
reporting is unavailable, contact the repository owner privately and provide:

- the affected package, endpoint, or storage path;
- reproduction steps or a minimal proof of concept;
- expected and observed authorization boundaries;
- likely impact and any known mitigation;
- whether credentials, private host data, or third parties are involved.

Do not access data you do not own, degrade an external service, publish secrets,
or retain private data while investigating.

## Security-Sensitive Boundaries

- Importing repositories own domain behavior and private assets.
- `.fluxiq` contains host runtime state and must not be committed.
- Passwords, PINs, TOTP secrets, session IDs, trusted-client material, and
  decrypted vault values must not appear in logs or generated documentation.
- Global program endpoints require authenticated actors and declared
  permissions before handler dispatch.
- Malformed legacy JSON is preserved for recovery rather than silently reset.
- Production dependencies are audited at high severity in CI.

## Hosted Deployment Boundaries

`FLUXIQ_PROFILE` selects `local` (the default: today's behaviour on
loopback), `self-hosted` or `service`. A gateway is public on `service` or
when it binds beyond loopback, and public deployments apply these rules:

- **Origin.** The client gateway admits only Origins on its allowlist
  (`FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS`): exact web origins,
  `chrome-extension://<id>`, an exact `moz-extension://<uuid>`, or
  `moz-extension://*`. A public gateway refuses to start without an
  allowlist or with an entry the grammar refuses, and refuses an upgrade that
  carries no Origin.
- **Limits.** Frames over 16 MiB are refused before they are buffered, a
  socket that sends no `client.hello` within 10 seconds is closed, each socket
  is rate limited (50 messages a second, bursts of 200), pending pairings are
  capped at 5 per client address and 1,000 in all, ended sessions and the
  gateway audit ring are bounded. Each limit has a `FLUXIQ_CLIENT_GATEWAY_*`
  override.
- **Client address.** `X-Forwarded-For` is trusted only with
  `FLUXIQ_TRUST_PROXY=true`, and then only its rightmost entry, which the
  proxy must set itself rather than append to. Audit records carry an address
  prefix (/24 or /48), never the full address.
- **Owner claim.** `self-hosted` and `service` never accept the default
  `admin`/`admin` sign-in. The first owner is claimed at `/setup` with a
  one-time code from `FLUXIQ_SETUP_CODE_FILE`, or generated at first start
  into `.fluxiq/security/setup-code`. The server logs that file's path, never
  the code. A claim retires the default administrator.
- **Sessions and requests.** On an `https` public origin the session cookie
  is `__Host-fluxiq_session` (Secure, HttpOnly, SameSite=Lax, Path=/). The
  middleware refuses cookie-carrying writes from another site or origin,
  `getfluxiq.com` included. Bearer requests are exempt. Operator endpoints that
  recheck no credential (`deployment-sync/sync`, `deployment-sync/rollback`,
  `database-manager/run-migration`) are refused on a public profile.
- **Throttles.** Sign-in is limited per account and per trusted client
  address, with no panel-wide lockout that one caller could trigger for
  everyone. The setup, welcome and reset forms are throttled as well.
- **Private provisioning listener.** It starts only under `service` with
  `FLUXIQ_PROVISIONING_LISTEN` and `FLUXIQ_PROVISIONING_TOKEN_FILE`, and
  refuses a public bind. Its token, the setup code and any SMTP credential
  live only in mounted files, never in `.fluxiq`, the image, logs or the
  repository.
- **Logs and audit.** Public profiles log JSON lines with token, cookie,
  code, secret, password, key, authorization, session and body values
  dropped. Gateway security events are appended to
  `.fluxiq/security/gateway-audit.jsonl`, without pairing codes.

After a report is acknowledged, maintainers will reproduce it, determine the
affected versions, prepare tests and a fix, and coordinate disclosure after a
patched release is available.
