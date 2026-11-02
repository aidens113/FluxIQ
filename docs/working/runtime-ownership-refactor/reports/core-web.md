# Core Web Boundary Audit

## Scope and method

Read the Core `AGENTS.md` ownership, code-structure, and validation rules; `CODEX.md`; the code-structure and package-boundary architecture docs; and the `Current State` of the runtime-ownership refactor. Inspected Core `packages/fluxiq/src/runtime`, framework entry points, program exports, and `apps/web/src`, plus repository import references. No sources, shared documents, or git state were changed. No test or build commands were run.

## Findings

### 1. Core runtime contracts directly depend on Automation Studio contracts

- `packages/fluxiq/src/runtime/contracts.ts` imports `AutomationStudioFailureRecord` and `AutomationStudioTargetActionabilityRecord` from `@fluxiq/contracts/automation-studio`, then uses them on the generic `FluxIQRuntimeCommandResult` (`failure` and `actionability`). This makes the framework runtime layer depend on one global program's contract package.
- `packages/fluxiq/src/runtime/result-control/read-actionability.ts` parses `AutomationStudioTargetActionabilityRecord` and names the reader `readRuntimeTargetActionability`; `packages/fluxiq/src/runtime/client-gateway-transport.ts` validates Automation Studio failure records from untrusted client results. `packages/fluxiq/src/runtime/attempt-withholding.ts` also imports the Studio failure type. This is an ownership leak across the same boundary, even though the operations are generic transport/result handling.
- The actionability record and its parser are imported in the Automation Studio runtime (`programs/automation-studio/runtime/actionability`) as well as generic runtime. Failure records are consumed across Studio runtime paths and the client gateway runtime path. No evidence found for another independent global program consuming either Studio-specific record. The `@fluxiq/contracts/automation-studio` package export itself explicitly names the program, so this is not evidence of a genuinely shared contract.
- Recommended destination: move the generic result-control shape and untrusted-record validation to a domain-neutral contracts area, or make the runtime result carry opaque generic JSON and let Automation Studio validate/interpret its own metadata at its adapter boundary. Preserve the current public runtime result fields during migration; changing their types or parse/refusal behavior affects `fluxiq/runtime` consumers. Avoid a dependency from shared contracts back to `fluxiq`.
- Compatibility risk: consumers may rely on typed `failure` / `actionability` records and on malformed/accessor values being discarded. Keep the wire shape and validation behavior stable while changing the owner/import path; only remove or narrow public fields in a separately versioned compatibility change.

### 2. Runtime is semantically web-oriented in examples and naming, but its core mechanics are transport-generic

- `packages/fluxiq/src/runtime/contracts.ts` includes `websocket` as a transport kind, but also `worker`, `remote`, `native`, `direct`, and `custom`; commands identify actions by opaque strings and generic JSON parameters. `ClientGatewayRuntimeTransport` adapts the generic Core client gateway service, selects a connected session, dispatches a command, and validates the response. Its `websocket` kind reflects the client-gateway connection transport; it does not access a browser, DOM, tab, selector, or page.
- Runtime tests use examples like `web.dom.click`, `selector`, `web-automation`, and browser terminology. These are fixture values illustrating opaque domains/action types. They do not establish that generic runtime mechanics resolve selectors or own browser behavior. The browser-specific implementation and target matching belong downstream as the brief says.
- `packages/fluxiq/src/programs/_shared/runtime.ts` constructs the runtime and registers `ClientGatewayRuntimeTransport`; it is shared program-flavoured runtime infrastructure. The web panel reads runtime snapshots and run records through type-only imports from `fluxiq/runtime` in `apps/web/src/features/programs/live-views/runtime/{RuntimeRunDetail.tsx,RuntimeLive.tsx,runtime-snapshot.ts}`. These are actual Core and web-panel consumers of the generic runtime boundary; the imports do not prove a second domain consumes the Studio-specific contracts above.
- Recommendation: retain transport/session dispatch and opaque command/result mechanics in framework runtime. Keep browser DOM inspection, selector resolution, tab selection, browser action adapters, and their matching/rebinding logic in the web-extension domain. Rename generic runtime types only if a broader public API cleanup is planned; the current identifiers alone are not a reason to move these mechanics.

### 3. Web panel placement is mostly consistent with the architecture boundary

- `apps/web/src/features/programs` contains panel presentation, live-view DTO mapping, UI performance reporting, and feature-specific controls; this matches the documented `apps/web/src/features/<feature>/` owner.
- `apps/web/src/server` and `apps/web/src/lib` contain Next.js/server-host concerns such as websocket listener startup, origin policy, authentication/authorization, workspace tenancy, and route helpers. These are host composition and HTTP/server concerns, not browser DOM or web-automation domain logic. The standalone reusable websocket framing/session-selection pieces live under `packages/client-gateway-websocket`, with the server binding under `apps/web`.
- No direct `apps/web` imports from a downstream web-extension repository or browser modules were found in the inspected source. There is no evidence here of a Core framework dependency reaching into the web panel.

### 4. Potential layering concerns to verify before moving files

- `packages/fluxiq/src/framework/index.ts` imports `AutomationStudioIoRecorder`, `AutomationStudioNativeNodeRuntime`, and program runtime construction through `programs/index.ts`, and framework storage migration names the `programs/automation-studio` storage layout. This is a framework-to-program dependency, but it appears to be established global-program lifecycle/storage integration rather than browser/web leakage. Verify its actual import graph and migration compatibility before altering; do not infer it should move downstream from the name `AutomationStudio` alone.
- `packages/fluxiq/src/programs/automation-studio/runtime/*` intentionally contains significant domain vocabulary (`web.*`, browser, page, selector) in policy, authoring guidance, and tests. The inspected examples are mostly contracts/instructions and tests, not browser APIs. Classify each source by behavior before moving; some policy and generic flow-engine coordination may remain in Core while concrete web matching and adapters should not.
- No dependency cycle was established by this read-only pass. The most direct suspect is runtime -> `@fluxiq/contracts/automation-studio`; check the package dependency graph and public barrel paths before changing it. The `runtime` package imports the client gateway service; client gateway imports shared contracts/core, so a new reverse import from client gateway into runtime would create an undesirable cycle.

## Suggested focused checks for implementation

1. `pnpm --filter fluxiq check` and `pnpm --filter @fluxiq/contracts check` after any contract relocation.
2. Tests under `packages/fluxiq/src/runtime/tests/` and the tests owning Automation Studio actionability / failure parsing, plus relevant `packages/contracts/src/automation-studio/tests/` tests.
3. `pnpm structure:check` and a static import-boundary check ensuring framework/runtime paths do not import `@fluxiq/contracts/automation-studio` or `programs/automation-studio` except explicitly reviewed lifecycle seams.
4. If transport behavior or serialized result shape changes, focused client-gateway transport integration tests in Core and web-extension boundary tests; manually validate browser behavior only if browser adapter/action execution changes.

## Return contract

Outcome: Done
Changed: `docs/working/runtime-ownership-refactor/reports/core-web.md`
Validation: Read-only `rg`/`Get-Content` inspection -> completed; no tests run because this was a read-only discovery brief.
Not verified: Runtime import graph via compiler/audit; live browser behavior; behavior under a second non-Automation-Studio domain consumer.
Report: `docs/working/runtime-ownership-refactor/reports/core-web.md`
Notes: Generic runtime and panel mechanics are largely correctly placed. The clear ownership leak is runtime's direct dependency on Automation Studio result-record contracts and parsing.
