# P1 FluxNode, Flow and data contracts: worker report

Worker: worker-heavy, task t879 (branch `task/t879-fluxnode-contracts`). Nothing committed.

## Outcome

Done. `@fluxiq/contracts/fluxnode` exists, typechecks, builds and loads from `dist`. 117 new tests pass,
and the package's 783 tests pass in all. The structure audit passes with no finding or warning in any new file.

## What changed and why

All new except `package.json`, which gains one line: the `./fluxnode` export.

- `src/fluxnode.ts` is the entry, the same pattern as `platform.ts`. `tsconfig.base` `@fluxiq/contracts/*` already maps to it, and no build config changed.
- `src/fluxnode/index.ts` is the barrel. It re-exports only the issue *types* from `issue/`, so the zod bridge stays internal (a test checks this).
- `issue/`: `FluxNodeIssue {path (JSON Pointer), code, message}` and `FluxNodeParseResult<T>`. `zod-bridge.ts` holds `parseWithZod`, `zodFromParser` and `finishRawParse`. These let hand-written parsers sit inside zod objects, with pointers taken from the root of the document.
- `json/`: `isJsonValue`/`findNonJsonPart` (cycle- and depth-safe), `jsonValueSchema`, `jsonObjectSchema`, `jsonEqual`, `canonicalJson` and `formatJsonPointer`.
- `fields/`: the shared field shapes (id, callerKey, epochMs, count, usd, sha256Hex, shortText, personText).
- `type-schema/`: `JsonTypeSchema` (the subset), `parseJsonTypeSchema`, `jsonTypeSchemaSchema`, `validateJsonValue`, `matchesJsonTypeFormat` and `canonicalJsonTypeSchema`.
- `flow/`: Flow paths (`parseFlowPath`, `joinFlowPath`, `flowPathFolder`), automatic placement (`flowPathSegmentFromText`, `automaticFlowPath`), FluxNode names (`isFluxNodeName`, `fluxNodeNameToFlowPath`), Call Flow (`CALL_FLOW_NODE_TYPE = "builtin.control.call-flow"`, `flowCallTargetSchema`) and the Flow interface (`flowInterfaceSchema`, `flowInputsSchema`, `flowInputNames`).
- `spec/`: `fluxNodeSpecSchema` and `parseFluxNodeSpec`; runtime, scope (`fluxNodeScopeAllowsSite`), options (`resolveFluxNodeOptions`) and goal (`readFluxNodeGoal`, `fillFluxNodeGoal`); `fluxNodeSpecIdentity`, `canonicalFluxNodeSpec` and `fluxNodeSpecHash`.
- `run/`: the request plus `checkFluxNodeRunInputs`; the result with its verdict and cost; events; answers (`fluxNodeAnswerFitsEvent`); `FLUXNODE_ERROR_CODES` and the error body.
- `data/`: field paths, the expression language (`parseDataExpression`), lineage, `datasetRefSchema`, sinks, `dataStepSchema` (10 kinds) and `dataPipelineSchema`/`parseDataPipeline`.
- `http/`: `FLUXNODE_API_PATHS`, the methods, `fluxNodeApiPath`, and the request and response bodies for each endpoint. Also `FLUXNODE_ERROR_HTTP_STATUS` and the SSE framing (`formatFluxNodeEventFrame`, `parseFluxNodeEventFrame`).
- Tests sit in `tests/` beside each subject. `fluxnode/tests/entry.test.ts` checks three things: the public names exist, the bridge is internal, and no non-test file imports `node:` or contains "subflow".

## Decisions where the plan was silent (lead may overrule)

1. **Type subset semantics.** Every keyword the subset keeps has JSON Schema's meaning, with these exceptions and choices:
   - `format` is asserted, not an annotation.
   - `additionalProperties` defaults to *allow*, as JSON Schema does.
   - `$schema` is accepted at the root only, and dropped.
   - The annotations `title`, `description`, `default` and `examples` are allowed.
   - `{}` means any value.

   Further rules:
   - A kind-specific keyword needs `type` to name its kind (`{minLength:3}` is refused).
   - `required` names must be declared under `properties`.
   - Boolean schemas are refused except as `additionalProperties`.
   - Tuple `items` is refused.
   - Refused keywords say what to write instead. For example, `nullable` gets "list "null" in type".
   - Limits: depth 32, 4096 schemas, 512 properties, 1024 enum values, 64 alternatives.
2. **Validator.**
   - Errors come back in document order, each with a JSON Pointer.
   - A type mismatch stops the other keywords of that schema.
   - A failing `anyOf`/`oneOf` gives one error (`any_of`, `one_of_none`, `one_of_many`).
   - Non-JSON input gives `not_json` at the offending part.
   - String length counts code points.
3. **One path notation everywhere:** JSON Pointer (RFC 6901). Both the parser's issues and the validator's errors use it.
4. **Flow paths.**
   - A segment is lowercase `a-z0-9._-`. It starts and ends with a letter or digit, and has no `..`.
   - At most 8 segments of 64 characters each, and 256 characters in all.
   - A person's display name is separate text, not the path.
5. **FluxNode names** are lowercase, 1-8 dotted parts.
6. **Goal placeholders and scope.**
   - Placeholders are `{identifier}`, and `{{ }}` writes a literal brace. Any other brace is refused.
   - A placeholder must name a property declared under `inputs`, so undeclared inputs mean the goal can have no placeholders.
   - The run-time check also requires each placeholder's input to be present.
   - `scope` and `scope.acts` are required; `acts: []` means read only.
   - A site entry covers itself and its subdomains, and may carry a port.
7. **Web start.** It must be an http(s) address, and its host must be inside `scope.sites` when sites are listed.
8. **Spec fields.**
   - `hasCheck` defaults to false.
   - `uses` is deduplicated and may not name the FluxNode itself.
   - Option caps: retries at most 100, budget at most $100,000, timeout at most 7 days.
   - The default budget stays at $5, and 0 is allowed.
9. **Spec hash.**
   - It covers runtime, goal (whitespace collapsed), start, scope (sets sorted), inputs and outputs (canonical: type lists, `required`, `enum`, `anyOf` and `oneOf` sorted).
   - It excludes name, options, `hasCheck` and `uses`.
   - The result is plain 64-hex.
   - `canonicalFluxNodeSpec` is the full form, options included.
10. **Run request fields beyond the brief.**
    - `specHash`, used with `name`, runs a specific registered version.
    - `resumeHandle` continues a `budget_out` or `waiting_for_person` run, keeping its inputs.

    Exactly one of `spec`, `name` and `resumeHandle` is allowed. Inputs for an inline spec are validated in the parser.
11. **Result invariants.**
    - There is no `failed` status.
    - `achieved` never has a `refuted` verdict.
    - A resume handle is present exactly for `budget_out` and `waiting_for_person`, and `waitingFor` exactly for the latter.
    - `verdict.by` is present exactly when the label is confirmed or refuted, and `refuted` needs a `reason`.
    - `outputsType` carries the inferred type when no output type was declared.
    - Lineage is embedded in the result, at most 1000 entries.
    - `flowId` and `flowPath` are always required (see question 4).
12. **Events.**
    - `seq` starts at 1, and `at` is epoch ms.
    - `step.state` includes `failed`, for a step only.
    - `person_needed` carries `need` (`sign_in`, `human_check`, `confirm` or `other`) and an optional `waitUntil`.
    - Transform events and answers carry up to 1000 records.
13. **Data steps.**
    - Expressions are a JSON AST with 28 operators and fixed arities.
    - A field path is dotted text or a list of steps, for keys with spaces.
    - `map.as` defaults to `"result"`. `skipProcessedBy` and `reuseResultsForMs` cover plan D4.
    - `validate.onInvalid` is `drop` or `reject`, and `reject` feeds a "no" back to the run.
    - Sinks:
      - A file sink takes a relative path with no `..`.
      - A webhook must be https, or http on loopback only, with no credentials in the address and no headers. Secret headers are left to the keys design.
14. **HTTP.**
    - Base path `/api/fluxnode/v1`.
    - Endpoints:
      - POST `specs`
      - POST or GET `runs`
      - GET `runs/{runId}`
      - GET `runs/{runId}/events` (SSE: `id`=seq, `event`=type, reconnect by `Last-Event-ID` or `?after=`)
      - POST `runs/{runId}/answers`
      - POST `runs/{runId}/stop`
      - POST `fluxnodes/{name}/export` (`{specHash?, pin}`, format tag `fluxiq.fluxnode-flow` v1)
    - Registering a spec is idempotent, and the response carries `created` and `previousSpecHash`.

## What the plan got wrong or left in tension

1. **The plan's own example breaks the brief's scope rule.** It writes `scope.acts: ["read"]`, but the brief says reads need no grant. The parser accepts `"read"` and drops it, so the example parses, and `"read"` does not affect the hash.
2. **N1 and the brief list different hash inputs.** N1 names goal, output type, scope and runtime. The brief adds inputs and start. I followed the brief.
3. **"retries (min 3: a caller may raise, never lower)" is ambiguous.** I implemented it as the standing floor of 3: an override replaces the declared value as long as it is at least 3. If it means "never below the spec's declared value", `resolveFluxNodeOptions` should take the max.
4. **FluxNode paths and automatic placement can collide.** O2 maps a FluxNode name with no runtime prefix (`market/cheapest-listings`), while automatic placement starts with the runtime (`web/...`). A FluxNode named `web.x` would share a folder namespace with automatically filed web Flows. P6 should decide, for example by giving FluxNodes a root folder.
5. **Zod's schema output can fall outside the subset.** The SDK example uses `z.string().url()`. Zod's own JSON-Schema output for email or url can include `pattern`, which the subset refuses. The SDK lane must drop `pattern` where a `format` is present, or the lead must add `pattern` (which carries a ReDoS risk on the server).

## Commands run and observed results

From `packages/contracts`:
- `pnpm run check` exited 0 (`{"build-cache":"build","step":"contracts:check",...}`). Plain `tsc --noEmit -p tsconfig.json` printed nothing.
- `pnpm run test` printed `Test Files 74 passed (74)` and `Tests 783 passed (783)`, exit 0.
- `vitest run src/fluxnode` on the second run printed `Test Files 21 passed, 1 failed`. The failure was my test splitting JSON inside a string across SSE data lines; I fixed the test. The full run above includes all 22 files passing.
- `pnpm run build` exited 0. `dist/fluxnode.js` and `dist/fluxnode.d.ts` were emitted, and there is no `tests/` under `dist`.
- A Node smoke import of `dist/fluxnode.js` printed `spec ok: true hash: 519d9457…0f71` and `exports: 127`.

From the worktree root:
- The first run of `node scripts/structure-audit.mjs` failed on `web-vocabulary`. `flowInputsTypeSchema` contains "input type", and the sink read `address.password`. I renamed the schema to `flowInputsSchema`/`readFlowInputs`, and the sink now refuses credentials by matching the address text.
- The rerun printed `structure-audit: passed (534 warning(s), 1097 baselined).`, exit 0. None of the warnings is in a fluxnode file, and the baseline is unchanged.

## Not verified

- No consumer (SDK, engine, HTTP server) has been built against these contracts yet.
- The entry has not been loaded in a browser bundle. It is not among `browserBundles.entries` in `scripts/structure-audit/config.mjs`, which I do not own. My entry test checks only that there are no `node:` imports.
- Zod-to-JSON-Schema output from the SDK has not been run through `parseJsonTypeSchema` (see item 5 above).
- I did not run Core's full workspace check or `pnpm check`, only the contracts package's own scripts.

## Open questions / follow-ups for the lead

1. Add `packages/contracts/src/fluxnode.ts` to `browserBundles.entries`, so the `browser-imports` rule guards it.
2. Update `docs/architecture/package-boundaries.md` (the contracts row and the exports section) and the contracts README for the new subpath. Bump `@fluxiq/contracts` to a minor version (0.15.0 to 0.16.0) when it merges, since the package is published.
3. Pinning (N8): should a run request carry the pinned Flow (a reference or the export document) for a fresh cloud engine? Today pinning is server state set through the export endpoint.
4. A run's `flowId` and `flowPath` are required. With a budget of 0 and no learned Flow yet, the engine must still create a draft Flow, or these fields become optional.
5. Point 3 of the previous section: is the retries rule a floor of 3, or never below the spec's declared value?
