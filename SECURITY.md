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

After a report is acknowledged, maintainers will reproduce it, determine the
affected versions, prepare tests and a fix, and coordinate disclosure after a
patched release is available.
