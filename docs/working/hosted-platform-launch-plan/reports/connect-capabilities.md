# Explicit connect flow discovery

Outcome: Implemented; owning contract validation passed. Independent web acceptance is reserved to the lead's combined rebuilt-library checkpoint.

## Public interface

Discovery v1 now accepts and retains optional:

```ts
connect.flows?: {
  authorizationCodePkce: boolean;
  referenceCode: boolean;
}
```

Both booleans are required when `flows` is present. Missing means legacy/unknown; it is not inferred from advertised endpoint paths. Invalid objects, missing flag values and non-booleans refuse. Future unknown fields are dropped consistently with the existing additive discovery contract.
Existing `authorizeUrl`, `tokenUrl`, `revokeUrl` and `codeEntryUrl` remain required; discovery version 1, gateway protocol versions and origin/endpoint checks are unchanged. The public inferred type is available through the existing `FluxIQDiscoveryDocument` export.

## New server output

| Profile | Gateway enabled | authorizationCodePkce | referenceCode |
| --- | --- | --- | --- |
| local | true or false | false | false |
| self-hosted | true or false | false | false |
| service | true | true | false |
| service | false | false | false |

The web builder always writes both flags. Required URL fields describe endpoint locations; they do not claim an unavailable typed-code or local hosted flow works. Downstream must select hosted PKCE only when explicitly true and retain its existing local pairing path.

## Changed files

- `packages/contracts/src/platform/discovery/discovery-document.ts` and its owning test.
- `apps/web/src/app/api/discovery/build-discovery-document.ts`, `tests/build-discovery-document.test.ts` and `tests/discovery.test.ts`.
- This report only; no other source or shared document changed by this worker.

## Validation

`pnpm.cmd exec vitest run src/platform/discovery/tests/discovery-document.test.ts` in `packages/contracts` -> **36 passed**.
This includes unchanged legacy documents without flags, all valid boolean combinations, malformed flags, forward-compatible unknown-field removal, version/protocol preservation and unchanged foreign-origin/unsafe-token-endpoint rejection with flags present.

Six exact profile/enabled builder cases and local/service HTTP discovery assertions are authored. No web tests, shared build, full suite, browser, server or provider call ran while Core sources are changing. Source is stable; the lead explicitly retained the combined rebuild and discovery/HTTP test run, so this worker does not duplicate it. Independent web acceptance remains pending that observed result.

Outcome: Done (assigned source and owning contract validation; independent web acceptance pending with lead)
Changed: contracts discovery schema/tests; web discovery builder/tests; this report.
Validation: `pnpm.cmd exec vitest run src/platform/discovery/tests/discovery-document.test.ts` -> 36 passed.
Not verified: Web discovery tests against fresh shared builds; downstream consumer; actual browser or deployment.
Report: docs/working/hosted-platform-launch-plan/reports/connect-capabilities.md
Notes: Additive v1 flags only. Existing URL/version/origin boundaries preserved. No shared build or stale-dist test override.
