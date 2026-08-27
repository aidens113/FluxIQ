# Quality And Dependency Security

FluxIQ uses layered validation rather than treating one broad percentage or
tool as proof of correctness.

## Required Gates

```bash
pnpm check
pnpm quality:check
pnpm quality:coverage
pnpm test
pnpm build
pnpm docs:check
pnpm audit --prod --audit-level high
pnpm package:lint
pnpm package:smoke
```

`quality:coverage` is deliberately focused on authorization, persistence,
login lockout, and program-route behavior. It enforces thresholds only for
those named modules; it does not claim repository-wide UI coverage.

Biome adoption is allowlisted in `biome.json`. Newly maintained critical files
should be added to that list, while broad formatting changes should remain
separate from behavioral work.

## Dependency Ownership

Packages normally declare dependencies they import directly. The framework
runtime owns native SQLite and QR generation; TypeDoc remains
development/optional tooling rather than an ordinary runtime install. The web
app also declares `sqlite3` because Next externalizes native addons and must be
able to resolve that runtime package from the deployed application boundary.
It does not duplicate YAML or Zod merely because another workspace package
uses them.

The root pnpm overrides pin patched PostCSS and Sharp releases required by the
current compatible Next.js 15 line. They address high-severity transitive
advisories while avoiding an unrelated major Next.js upgrade. Remove an
override only after the owning dependency requires an equal or newer safe
version and `pnpm audit --prod --audit-level high` remains clean.

See the repository root `SECURITY.md` for private vulnerability reporting and
security boundaries.

## Web Login And Bootstrap Setup

The web login uses staged password and authenticator entry. It does not publish
bootstrap credentials in normal interface copy. When the framework bootstrap
administrator authenticates with the temporary credential, the login response
marks that session for credential setup and the web app requires an authorized
self-password rotation before opening the program directory.

The setup password is at least 12 characters and cannot reuse the bootstrap
value. Login preserves entered values across server errors, reports Caps Lock,
supports password visibility, and shows a live lockout countdown. This
bootstrap detection is a compatibility boundary for the current default-admin
runtime; future identity metadata may replace it without changing the UI flow.