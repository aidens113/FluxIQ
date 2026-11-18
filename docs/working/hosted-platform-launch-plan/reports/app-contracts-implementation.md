# Standard custom-app contracts implementation

Outcome: Done. The browser-safe `@fluxiq/contracts/apps` contract source is frozen for the lead's coordinated dependency build. This unit defines and checks metadata; it does not install an app, establish publisher or caller authority, dispatch execution, reserve funds, or return an accepted-run receipt.

## Owned changes

Added `packages/contracts/src/apps.ts` and cohesive `apps/{bindings,error,grants,installation,manifest,operation,validation}/` modules, with five adjacent owner test files and shared test fixtures. Added only the `./apps` package export in `packages/contracts/package.json`; no version, dependency, other package export, build output, SDK, Core, web, or extension source was changed by this unit. The package version bump and integration exports remain with the lead.

## Frozen public API

The entry exports the types `AppManifestV1`, `AppManifestContentV1`, `AppPin`, `AppOperation`, `AppGrant`, `AppBackendBinding`, `AppExecutionTarget`, `AppPayerPolicy`, `AppInstallationV1`, `AppInvocationV1`, `AppOperationResolutionV1`, `AppContractErrorCode`, `AppContractError`, and `AppParseResult<T>`.

```ts
type AppParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AppContractErrorCode; message: string } };

parseAppManifest(value: unknown): AppParseResult<AppManifestV1>;
parseAppOperation(value: unknown): AppParseResult<AppOperation>;
parseAppGrant(value: unknown): AppParseResult<AppGrant>;
parseAppInstallation(value: unknown): AppParseResult<AppInstallationV1>;
parseAppInvocation(value: unknown): AppParseResult<AppInvocationV1>;
parseAppOperationResolution(value: unknown): AppParseResult<AppOperationResolutionV1>;
canonicalAppManifest(manifest: AppManifestV1 | AppManifestContentV1): string;
appManifestDigest(manifest: AppManifestV1 | AppManifestContentV1): Promise<string>;
verifyAppManifest(value: unknown): Promise<AppParseResult<AppManifestV1>>;
validateAppInstallationAgainstManifest(installation: unknown, manifest: unknown): AppParseResult<AppInstallationV1>;
validateAppOperationInputs(operation: AppOperation, value: unknown): AppParseResult<JsonValue>;
validateAppOperationResult(operation: AppOperation, value: unknown): AppParseResult<JsonValue>;
appGrantCovers(approved: AppGrant, requested: AppGrant): boolean;
appContractError(code: AppContractErrorCode): AppContractError;
```

Raw Zod schemas/issues are internal to the package entry. Public parsers return fixed diagnostic words without rejected values, supplied property names, or arbitrary thrown messages. Unsupported numeric outer `schemaVersion` values return `app.unsupported_version`. Other codes are `app.invalid_manifest`, `app.invalid_operation`, `app.invalid_installation`, `app.invalid_invocation`, `app.invalid_resolution`, `app.manifest_digest_mismatch`, `app.installation_pin_mismatch`, `app.grant_expansion`, `app.invalid_inputs`, `app.invalid_result`, and `app.unavailable_crypto`.

## Frozen structural fields

`AppManifestV1` has `schemaVersion: 1`, `publisherId`, `appId`, `version`, `packageDigest`, `manifestDigest`, `frontend`, `operations`, `requestedGrants`, `requirements`, `compatibility`, and `updatePolicy`. `AppManifestContentV1` omits only `manifestDigest`. `AppPin` is `{ publisherId, appId, version, packageDigest, manifestDigest }`.

`frontend` is `{ mode: "production" | "loopback-development", entryUrl, allowedOrigins, redirectUris }`. Entries and redirects must be canonical absolute URLs within exact registered origins. Production uses HTTPS. Development requires every frontend URL/origin to be loopback; arbitrary HTTP, wildcard, URL credentials, fragments, duplicate registrations, and unregistered redirect origins fail. Frontend mode does not decide execution location: explicit loopback frontend plus cloud requirements is valid metadata.

`AppOperation` is `{ id, kind: "query" | "execution", inputs: JsonTypeSchema, result: JsonTypeSchema, binding: AppBackendBinding, requestedGrants: AppGrant[] }`. The opaque backend binding is `{ kind: "dataset-query" | "fluxnode" | "pipeline" | "flow", id, definitionDigest }`. Queries require dataset-query bindings and nonempty dataset-read grants; execution uses a non-query binding and its exact `automation.execute` binding grant. No executable source, arbitrary options, or caller/payer claims are accepted.

The closed grant union is `{ capability: "dataset.read" | "dataset.write" | "secret.use", bindingId }`, `{ capability: "network.origin", origin }`, or `{ capability: "automation.execute", bindingId, acts: FluxNodeActClass[] }`. Effects reuse existing `change`, `send`, `money`, and `delete`; an empty effect list permits no lasting-act class. Capability/resource pairs appear once. Structural coverage requires exact capability/resource equality and an effect subset. Manifest requests must cover all operation requests; approved installation grants must remain a subset of manifest requests.

`requirements` is `{ runtimes: string[], environments: ("local" | "self-hosted" | "cloud")[], callbacks: { id, kind: "server" | "local-worker" | "browser-interaction" }[] }`. Environment declarations are nonempty; execution requires a named runtime. `compatibility` is `{ appProtocolVersion: 1, minimumCoreVersion }`; `updatePolicy` is `"pinned" | "consent-required"`. Hosts must still check actual runtime/version/callback support and obtain any update consent.

`AppInstallationV1` is `{ schemaVersion: 1, installationId, workspaceId, app: AppPin, approvedGrants, target, payer, installedByUserId, installedAtMs, updatedAtMs, generation, revision, status: "active" | "revoked", revokedAtMs? }`. Generation/revision are positive safe integers; times are nonnegative safe integers with consistent lifecycle ordering and revocation state.

`AppExecutionTarget` is `{ kind: "customer-owned", environment: "local" | "self-hosted", targetId }` or `{ kind: "managed-cloud", environment: "cloud", targetId }`. `AppPayerPolicy` is `{ kind: "no-managed-compute-charge" }`, `{ kind: "workspace", accountId }`, or `{ kind: "publisher", accountId }`. Customer-owned targets require no managed compute charge. Managed execution requires explicit account policy; existing-data-only cloud metadata can carry no charge. Account ids and stored approvals never prove present authorization. A query causes no compute debit; host policy must preserve that boundary.

`AppInvocationV1` is exactly `{ schemaVersion: 1, installationId, operationId, inputs: JsonValue, idempotencyKey }`. Inputs are required and support scalar, array, object, boolean, number, or null roots. Business fields named role/workspace/payer remain ordinary data; adding authority fields to the outer envelope fails.

`AppOperationResolutionV1` is `{ schemaVersion: 1, kind: "operation-resolution", installationId, operationId, operationKind, manifestDigest, generation, revision, binding, target, payer, requiredGrants }`. It enforces query/binding and explicit payer consistency, but contains no run id, accepted flag, execution status, bearer, or authority proof.

## Integrity, typed data, and authority limits

Canonical manifest content includes the package digest and every parsed field except its own manifest digest. It canonicalizes object keys, declared sets, operation/callback identities, effect sets, and the existing JSON schema canonical form; ordered examples remain ordered. SHA-256 uses Web Crypto only. Digest verification detects content changes, including publisher/version/package changes, but cannot establish provenance or publisher verification. Canonical/digest helpers throw fixed safe messages for invalid input or crypto failure.

Both input and result schemas reuse `jsonTypeSchemaSchema` without FluxNode's privileged `secretInputs` option; that existing parser refuses `format: "secret"` at every position. Regression cases cover direct secret declarations, default/examples/enum/const values, nested properties/items/additionalProperties, and anyOf/oneOf for both input and result schemas. Named `secret.use` bindings remain metadata only. Data validation reuses `jsonValueSchema` plus `validateJsonValue`, withholding their raw diagnostics.

`validateAppInstallationAgainstManifest` is a synchronous structural check of the exact app pin, declared target environment, and grant subset. Callers must separately verify digest/provenance, immutable version storage, fresh user/workspace/IAM authority, installation CAS/revocation, actual target permission, and server-authorized payer account. `appGrantCovers` assumes parsed typed grants and supplies no authorization. No endpoint, runtime adapter, or paid fallback is implemented here.

## Validation observed

- `pnpm.cmd --dir packages/contracts exec vitest run src/apps --pool=forks --maxWorkers=1 --minWorkers=1` -> **5 files, 69 tests passed**: operation31, manifest24, digest6, installation6, browser entry2. Final run duration4.81s.
- Source-local TypeScript compiler API probe using the contracts tsconfig, `noEmit: true`, `incremental: false`, `composite: false`, and roots `src/apps.ts` plus its five owner test files -> **6 roots, 0 diagnostics**. No files emitted.
- Owner-scoped structure rules using `createContext`, all repository files for resolution, and only the47 owned scripts as subjects -> **17 rules, 0 findings**: file-lines, directory-files, class-methods, exported-values, statement-packing, swallowed-failure, failure-as-empty, as-never, test-placement, naming, import-cycles, imports, contract-spread, facade-dispatch, regexp-template-escapes, restricted-references, shared-temp-root.
- Existing `walkBrowserGraph(completeContext, { entries: ["packages/contracts/src/apps.ts"], browserPackages: ["zod"] })` -> **99 reachable source modules, 0 problems**. The owner AST test also checks every reachable value edge and rejects Node globals, built-ins, credential/SDK/CLI/test paths, unresolved imports, and external packages other than declared browser-safe Zod. Type-only declarations are erased; empty runtime imports are followed.
- `git diff --check -- packages/contracts/package.json packages/contracts/src/apps.ts packages/contracts/src/apps` -> **exit0**, no output. Package diff was inspected: only the additive `./apps` export.

The initial `pnpm` PowerShell shim did not launch tests because local script execution is disabled; `pnpm.cmd` launched and passed. An intermediate scoped naming audit rejected my internal `common` directory; it was renamed `validation`, with final zero findings. Applying repository-wide root-consistency rules to an owner-only subject list produced missing-root harness assertions; those global rules were not claimed as owner validation and no production configuration/baseline was changed.

Not verified: package/declaration builds, final repository-wide audits, downstream web/SDK integration, actual browser bundling/loading, runtime execution, HTTP auth, durable app store, publisher verification, payment admission, or live provider calls. Builds and coordinated integration remain with the lead; no server/browser/provider was started. No mutating git was run, and files remain for lead review/commit.
