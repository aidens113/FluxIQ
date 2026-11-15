# Release discovery implementation

Discovery v1 now accepts optional `runtime` provenance containing `schema: 1`,
`protocol: fluxiq.core-runtime-identity.v1`, package `version` and lowercase SHA-256
`artifactDigest`. Old documents remain valid and unknown future fields are dropped.
Gateway protocol versions and `minimumClient` remain the compatibility metadata;
this change adds no client rejection enforcement or digest ordering.

The web builder projects provenance from the executing Core reader, omits it when
the reader returns null (including an unstamped placeholder), and refuses invalid
metadata through the discovery schema. Individual artifact paths/hashes are not
published. Lead granted the additive existing-reader/type export in
`packages/fluxiq/src/runtime/index.ts`; the runtime identity implementation was
not changed.

Validation:
- `pnpm.cmd --filter @fluxiq/contracts exec vitest run src/platform/discovery/tests/discovery-document.test.ts` -> 1 file passed, 22 tests passed.
- `pnpm.cmd --filter @fluxiq/web exec vitest run src/app/api/discovery/tests` -> configuration refused stale Core library builds before collecting any tests (runtime/index.ts newer than dist). Lead notified; coordinated build required after peer source edits finish.

Outcome: Partial
Changed: packages/contracts/src/platform/discovery/discovery-document.ts; packages/contracts/src/platform/discovery/tests/discovery-document.test.ts; packages/fluxiq/src/runtime/index.ts; apps/web/src/app/api/discovery/build-discovery-document.ts; apps/web/src/app/api/discovery/tests/build-discovery-document.test.ts
Validation: contract focused command above -> 22 passed; web focused command above -> stale-library guard prevented collection.
Not verified: Web builder/route tests pending coordinated library rebuild; package typechecks and structure audit left to lead.
Report: docs/working/hosted-platform-launch-plan/reports/release-discovery.md
Notes: No builds, servers, paid calls, shared documents or git changes. No downstream client changes.
