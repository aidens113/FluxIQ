# Runtime contract ownership implementation

Outcome: Done

## Changes

- Added public `@fluxiq/contracts/runtime` entry point and package export. It contains only neutral failure/actionability contract modules, with no Studio, host, or browser dependencies.
- Made `RuntimeFailureRecord`, `RuntimeTargetActionabilityRecord`, parsers, control projection, taxonomy types/constants, and repeated-answer constant canonical in their existing neutral owning directories.
- Preserved every existing Automation Studio export as an alias, including identical parser/constant identities and mutually assignable record types. Existing root exports continue transitively through the Studio compatibility barrel.
- Migrated the generic runtime contract, transport, withholding, and actionability reader imports to the neutral seam. No wire fields, validation conditions, discriminator strings, or runtime decisions changed.
- Added focused compatibility and compiled-boundary tests. The compiled dependency graph is restricted to local neutral modules and imported with Node independently of the repository source resolver.

## Validation

- `pnpm.cmd --filter @fluxiq/contracts check` -> passed, including after alias formatting cleanup.
- `pnpm.cmd --filter @fluxiq/contracts exec vitest run src/tests/runtime.test.ts src/failure/tests src/actionability/tests` -> 5 files, 50 tests passed.
- `pnpm.cmd --filter fluxiq exec vitest run src/runtime/tests src/runtime/result-control/tests src/runtime/build-identity/tests src/runtime/build-identity/modules/tests` -> 7 files, 48 tests passed.
- Initial `pnpm` invocations failed before launching checks because PowerShell blocks pnpm.ps1. Retried through pnpm.cmd successfully.
- No full suites, paid calls, live browsers, panel management, git mutations, package versions, or edits outside the assigned source paths and this report.

Not verified: Complete fluxiq package typecheck and repository structure audit are left to lead integration; live/browser behavior was not exercised because this change preserves contract/runtime behavior.
Report: docs/working/runtime-ownership-refactor/reports/runtime-contracts.md
Notes: Root wildcard tsconfig paths already resolve the new subpath. Lead owns documentation and package version policy.
