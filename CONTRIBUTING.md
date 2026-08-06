# Contributing to FluxIQ

FluxIQ is a public, domain-neutral framework. Contributions must keep private
host data, domain-specific automation, recordings, generated policies, and
importer assets outside this repository. Framework programs belong under
`packages/fluxiq/src/programs/`; importing repositories own their configured
domain program roots.

## Development Requirements

- Node.js 22 or newer
- pnpm 9.15
- Native build support for `sqlite3` when a prebuilt binary is unavailable

Install the locked workspace with:

```bash
pnpm install --frozen-lockfile
```

Before submitting a change, run:

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

Do not start the web panel as part of automated validation. For manual UI
testing, point it at a disposable importing repository and run:

```bash
pnpm --filter @fluxiq/web dev
```

## Change Boundaries

- Preserve public package exports unless the change explicitly includes a
  versioned API migration.
- Add tests beside behavior, especially for authorization, persistence,
  migrations, and input/output contracts.
- Update authored documentation with substantial behavior, storage, setup,
  security, or architecture changes.
- Do not commit `.fluxiq`, runtime documentation snapshots, databases,
  credentials, logs, package tarballs, build output, or importer-owned data.
- Use `pnpm docs:reference` when public FluxIQ exports change.

Biome adoption is intentionally scoped by `biome.json`. Expand that allowlist
as files are actively maintained; do not combine feature work with a repository-
wide formatting rewrite.
