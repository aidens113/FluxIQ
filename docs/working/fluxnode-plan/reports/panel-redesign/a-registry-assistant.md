# P9-A: assistant declarations on the program API registry

Worker report, 2026-11-09. Brief A of `panel-design.md` section 6.

## Outcome

Done. Every registration can now carry `assistant` (a tool declaration or `{ hidden: <reason> }`). The registry checks it when an endpoint registers. A derivation table assigns consequence classes, a catalog lists, finds and describes tools, a generator writes a file whose drift a test checks, and a parity test fails the build on undeclared endpoints. As the brief expects, the parity test fails today: all 249 live registrations are undeclared. Every other new test passes.

## What changed and why

Contracts (`packages/contracts`):
- `src/program-api/input/program-api-input.ts`: `programApiInput(z.object(...))` builds a `ProgramApiInput<T>` with `parse` (throws a `TypeError` that names each wrong field and drops unknown fields), `read` (does not throw) and `jsonSchema()` (draft 2020-12, `io: "input"`, `$schema` removed, deep-frozen, computed once). The schemas use `zod/v4`, which zod 3.25.76 already ships, and its `toJSONSchema`. No dependency was added.
- `src/program-api/assistant/`: `ASSISTANT_CONSEQUENCES` and `AssistantConsequence`, `PANEL_CONTEXT_KEYS` and `PanelContextKey` with type guards, and the generated file's entry types (`AssistantToolEntry`, `AssistantHiddenEndpoint`, `AssistantToolCatalogFile`).
- `src/program-api/automation-studio/flow.ts`: two real example inputs, `listFlowsInput` and `createFlowInput`. They are not wired to handlers, because the handler files belong to B1.
- `src/program-api-inputs.ts` and a `package.json` export `./program-api-inputs`. This is a new subpath, deliberately kept off the root entry and off `program-api.ts`, which the root re-exports. That way only importers of the subpath load `zod/v4`, and the extension's bundles do not grow. `program-api.ts` was not moved or changed.

Core (`packages/fluxiq/src`):
- `programs/_shared/api.ts`: `assistant?: ProgramEndpointAssistant` added to the registration, the params and the `endpoints()` summary. `register()` refuses a malformed declaration (`assistantDeclarationProblem`). `call()` is unchanged, PIN logic included.
- `programs/_shared/assistant/` (new):
  - `types.ts`: the declaration types.
  - `consequence-overrides.ts`: the one overrides table. The 4 run endpoints are `per-call` and `revoke-client-trust` is `security`.
  - `endpoint-consequence.ts`: the derivation. Precedence is explicit `consequence`, then the overrides table, then `security` (`identity-access` or `secret-keys`, `PermissionsManagement`, `program-gated`), then `delete` (`destructive`, `destructive-ungated`), then `read` (classification `read`, or access level `List`/`Read`), then `change` (`authoring`). Any other classification throws.
  - `run-consequences.ts`: the union over a Flow's lasting classes and permitted consequences. `send_or_publish`, `move_money` and `delete` map to send, money and delete, and the rest map to change. The floor is `change`.
  - `tool-name.ts`: tool names are `<programId>__<endpoint>`.
  - `tool.ts`: builds a tool from a registration.
  - `find-assistant-tools.ts`: lexical search with no model.
  - `catalog.ts`: `AssistantToolCatalog`, with `tools()`, `listFor(actor)` (pre-filtered by `registry.authorize`), `find(query, { among, limit })`, `describe(name)` and `consequencesOf(name, runTarget?)`.
  - `generated-module.ts`: `renderAssistantToolsModule`.
  - `undeclared-endpoints.ts`.
  - `index.ts`.
- `platform/iam/catalog/generated/assistant-tools.generated.ts`: generated in the style of the IAM lists. The generator is a render function plus a vitest drift test with a regenerate flag, the same pattern as `FLUXIQ_REGENERATE_IAM_CATALOG`. It is empty today: `tools: [], hidden: []`.
- `platform/iam/catalog/generated/index.ts`: one barrel line exporting the generated file. This file was not on my owned list, but every directory needs a barrel.

## Commands run and observed results

- `cd packages/contracts && npx vitest run src/program-api` -> 3 files, 12 tests passed.
- `cd packages/fluxiq && FLUXIQ_REGENERATE_ASSISTANT_TOOLS=1 npx vitest run src/programs/_shared/assistant` -> wrote the generated file. The only failure was the parity check.
- `cd packages/fluxiq && npx vitest run src/programs/_shared/assistant src/programs/_shared/tests/api.test.ts src/platform/iam/catalog` -> 9 files passed and 1 failed, 45 tests passed and 1 failed. The failure is `assistant-parity.test.ts > has an assistant declaration or a hidden reason on every endpoint`: "249 of 249 endpoints have neither `assistant` nor `assistant: { hidden }`", followed by the list grouped by program. Summary line: `{"registrations":249,"undeclared":249,"byProgram":{"automation-studio":188,"background-tasks":6,"compute-control":8,"database-manager":7,"deployment-sync":6,"docs":4,"identity-access":12,"production-runner":6,"runtime":5,"secret-keys":7}}`.
- `node scripts/structure-audit.mjs` -> 11 violations, all `[imports]` under `packages/fluxiq/src/flows/executable/outline/**`, which brief C owns. None are in my paths. An earlier run flagged two problems of mine, a prefix group and barrel-skipping imports; both are fixed.
- Under the lock with 4243 MB free, the fluxiq typecheck (`tsc --noEmit --incremental ...`) exited 0, and `packages/contracts` `tsc --noEmit` exited 0.

Undeclared endpoints per handler file, counted from the stack of each `register` call during `createGlobalProgramRuntime()` with a throwaway test that was then deleted. The total is 249:

| Handler file (`programs/...`) | Undeclared |
| --- | --- |
| automation-studio/api/handlers/activity.ts | 1 |
| automation-studio/api/handlers/artifacts.ts | 3 |
| automation-studio/api/handlers/caches.ts | 12 |
| automation-studio/api/handlers/client-gateway.ts | 7 |
| automation-studio/api/handlers/conversations.ts | 6 |
| automation-studio/api/handlers/datasets.ts | 6 |
| automation-studio/api/handlers/diagnostics/runtime-identity.ts | 1 |
| automation-studio/api/handlers/flow-lifecycle.ts | 19 |
| automation-studio/api/handlers/flows.ts | 10 |
| automation-studio/api/handlers/instructions.ts | 7 |
| automation-studio/api/handlers/llm-generation.ts | 5 |
| automation-studio/api/handlers/project-parts.ts | 4 |
| automation-studio/api/handlers/projects.ts | 17 |
| automation-studio/api/handlers/recordings.ts | 31 |
| automation-studio/api/handlers/router.ts | 12 |
| automation-studio/api/handlers/run-control.ts | 3 |
| automation-studio/api/handlers/runs.ts | 11 |
| automation-studio/api/handlers/runtime-execution.ts | 8 |
| automation-studio/api/handlers/runtime-sessions.ts | 2 |
| automation-studio/api/handlers/subflows.ts | 12 |
| automation-studio/api/handlers/task/attempt-carry-on.ts | 1 |
| automation-studio/api/handlers/task/attempt-run-again.ts | 1 |
| automation-studio/api/handlers/task/attempts.ts | 2 |
| automation-studio/api/handlers/task/known-flow.ts | 1 |
| automation-studio/api/handlers/task/project-tasks.ts | 3 |
| automation-studio/api/handlers/workspace.ts | 3 |
| background-tasks/api/handlers.ts | 6 |
| compute-control/api/handlers.ts | 8 |
| database-manager/api/handlers.ts | 7 |
| deployment-sync/api/handlers.ts | 6 |
| docs/api/handlers.ts | 4 |
| identity-access/api/handlers.ts | 12 |
| production-runner/api/handlers.ts | 6 |
| runtime-control/api/handlers.ts | 5 |
| secret-keys/api/handlers.ts | 7 |

## How to declare an endpoint (for B1-B4, verbatim)

```text
1. Schema: in packages/contracts/src/program-api/<programId>/<noun>.ts (one file per resource noun, e.g. automation-studio/flow.ts),
   `export const <endpointCamel>Input = programApiInput(z.object({ ... }));` with `import { z } from "zod/v4"` and
   `import { programApiInput } from "../input/index.ts"`. List every field the handler reads today (parse drops unknown ones);
   `.describe()` each field in plain, generic words (never shaped like a Lab task). Export it from that directory's index.ts
   (a new <programId>/ directory also goes in program-api/index.ts). Test: <programId>/tests/<noun>.test.ts (valid sample parses).
2. Handler: `import { listFlowsInput } from "@fluxiq/contracts/program-api-inputs";` then on the registry.register({...}) call add
   `assistant: { input: listFlowsInput, summary: "Lists the Flows in a project.", phrases: ["show my flows"], contextArgs: { projectId: "projectId" } }`.
   contextArgs keys must be input fields; values are page|projectId|flowId|stepNumbers|nodeIds|runId|datasetId|keyId|folder.
   Add `consequence` only when the derived class is wrong. The handler may read `listFlowsInput.parse(request.payload)`.
3. Hidden: `assistant: { hidden: "Cache upkeep the panel runs itself; nobody asks for it." }` (one sentence saying why).
4. Regenerate: cd packages/fluxiq; PowerShell `$env:FLUXIQ_REGENERATE_ASSISTANT_TOOLS='1'; npx vitest run src/programs/_shared/assistant`
   (bash: `FLUXIQ_REGENERATE_ASSISTANT_TOOLS=1 npx vitest run ...`), then once more without it. The parity test prints what is left, by program.
```

## Not verified

- No handler adopts a schema yet, and none declares `assistant`. That is B1-B4's work, so the example schemas have only been checked against the requests the handlers read today, by reading `flows.ts`.
- I did not build or test the extension or any other consumer of `@fluxiq/contracts`. Neither the contracts `dist` build (`pnpm --filter @fluxiq/contracts build`) nor the web typecheck has been run.
- `listFor` has been checked only under the default `local` profile. It has not been run under `service` with real policies.

## Open questions or contradictions found

- **Audit noise:** `registry.authorize` writes one IAM audit row per decision. As a result, `listFor(actor)` writes about 100 rows each turn once the tools are declared. Brief F, or a change to `ProgramIamGate` (`programs/_shared/iam/`, which I do not own), should add a decision that is not audited, or cache the list per turn.
- **Pre-filter scope:** `listFor` decides each tool on the workspace, or on the program for `ops:` actions. Under `service`, a grant scoped to one project could hide a tool the person could still call on that project. The call stays the real gate.
- **Count:** the live registry has 249 registrations, not the 272 the design document gives.
- **Ordering judgements:** an `authoring` endpoint with access level `List` or `Read` derives `read`, while `destructive` or `destructive-ungated` always derives `delete`. A `per-call` run with no target Flow derives change+send+money+delete, so the person is asked.
- **FluxNode run:** the design document lists a FluxNode run as `per-call`, but no such endpoint is registered yet. When it lands, add it to `ASSISTANT_CONSEQUENCE_OVERRIDES`. The parity test refuses an override that names an endpoint the registry does not have.
- **Parallel B workers:** B1-B3 all add to `program-api/automation-studio/index.ts`. Give each one distinct noun files. Studio's roughly 188 endpoints may push that directory past the 25-file cap, which would force subdirectories by feature. Every B worker's regeneration rewrites the same generated file, so the supervisor should regenerate once after merging all four.
- **JSON Schema extra fields:** the generated schema omits `additionalProperties: false`, because in `input` mode zod emits that only for strict objects. Unknown fields are dropped when the input is parsed.
- **Version bump:** `@fluxiq/contracts` gains a public subpath, and I did not bump its version (still 0.16.0). The lead decides whether to bump it.
