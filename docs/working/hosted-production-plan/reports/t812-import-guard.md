# t812 import guard

Outcome: Done.

What changed: `forbiddenImports` entries may now set `from` (a directory prefix) to apply only to files under it
(`scripts/structure-audit/rules/imports.mjs`). `config.mjs` gained an entry for `apps/web/src` banning specifiers
`@fluxiq/contracts` and `@fluxiq/contracts/*` (reason names the `fluxiq/<subpath>` remedy). The existing resolver only
handles relative paths, so `importBoundaries` could not express this. It covers `import`, `import type`, `export ... from`,
`export type ... from`, dynamic `import()`, and test files. Fail-first tests added to `scripts/structure-audit/rules/tests/imports.test.mjs`.

Mirror: `scripts/structure-audit.mjs` is NOT changed. `rules/imports.mjs` (a mirrored rule module, if the downstream copies rules) changed;
`config.mjs` is Core-only. Update the downstream copy of imports.mjs and its test in the same unit.

Commands: node --test (rules/tests + tests): 300 pass, 0 fail. `pnpm structure:check`: "structure-audit: passed (468 warning(s), 1152 baselined)".
`pnpm check`: ran after both; its structure-audit step passed and the output tail (last 25 lines) showed no failure; I did not capture its exit code separately.
No existing apps/web/src import of @fluxiq/contracts was found (the audit passes).

Not verified: tests were not run against the pre-change imports.mjs to watch them fail; downstream mirror not checked.
