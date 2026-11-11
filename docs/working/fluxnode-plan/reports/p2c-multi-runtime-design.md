# P2c Multi-runtime engine: design report

Worker: `worker-heavy` (design only; no code, no git, no Lab, no model calls). Date: 2026-11-11.
Line numbers are against the `dev` checkouts of Core (`!FluxIQ`), the web extension (`!FluxIQWebExtension`) and `!FluxIQTestEnvironments` as read on that date.

## Outcome

Done as a design. One engine can serve several runtimes, and the change is smaller than it looks, because most of Core is already keyed by domain:

- the node runtime's hooks, matchers and mappers;
- the client gateway's pairing and the paired-client domain gate;
- the runtime adapters and the run requirement gate;
- the harness option registry, built once per build;
- the host lease scheduler, which is per port;
- the domain readings, which travel in each run's async context.

What is single is a handful of **slots** on `AutomationStudioService`:
- one evidence binding;
- one host boundary;
- one native node runtime;
- one IO domain.

Above those, two things are single:
- the `FluxIQ` instance's one active domain;
- the FluxNode runner's one owner domain.

Every reader takes whatever is in those slots.

The design keeps the slots exactly as they are, as the **default bundle**. It adds a registry of further **runtime bundles**, keyed by domain and by FluxNode runtime id. Every reader then asks for the bundle of the Flow it works on. A Flow whose domain no registered bundle claims gets the default bundle, which holds the very same objects as today. So a web-only instance (every instance today) takes the same path, sends the same bytes and pays nothing.

## (a) Every single-domain assumption

### The slots on the service (`packages/fluxiq/src/framework/automation-service/service.ts`)

| Line | What is single | Effect with two domains |
| --- | --- | --- |
| 304, 307 | Constructor options `llmEvidenceRuntime`, `hostRuntime`: one each | Only one domain can be passed at construction |
| 389-394 | Fields `ioRuntime` (`{ io, domainId }`), `nativeNodeRuntime`, `hostRuntime`, `llmEvidenceRuntime`: one each | Everything below reads these |
| 425, 427, 484 | Execution and result-check resolvers wrapped with `() => this.llmEvidenceRuntime` | Every provider call, including a judge or a result check for another domain's run, is stamped with the one bound domain's system instructions (cross-runtime guidance leak) |
| 474 | `conversations.bindDomainInstructions(() => this.llmEvidenceRuntime?.systemInstructions?.text)` | The chat interpreter gets one domain's instructions for every project |
| 488-490 | `bindLlmEvidenceRuntime` replaces the slot | A second domain's binding replaces the first (P8a limit 1) |
| 516-519 | `bindIoRuntime(io, domainId)`: one IO domain | Policy-output dispatch and `authorizedDomainIds` are filtered to that one domain |
| 522 | `bindNativeNodeRuntime` replaces the slot, and calls `bindTrustedModuleIdentity(this, identity)` | A second runtime replaces the first. Binding without an identity sets the active identity to null (`runtime/build-identity/modules/bind.ts:7`), which erases the web host's provenance from diagnostics and the transport identity |
| 524 | `bindHostRuntime` replaces the slot | Same as 522 |
| 528-535 | `nativeRuntimeSummary` reads the one runtime | The web domain's `host.ts:23` binds its runtime only when this says unbound. If another domain bound first, web would silently skip its own nodes |
| 742, 788, 867 | Recording entry preparation, the proposal check and IO wiring read the one native runtime | Keyed by `domainId` inside, but only the slot's runtime is consulted |
| 1453 | Bootstrap readiness reads the slot | |
| 1499, 1518, 1522 | Build: declaration check, recorded-step reader, and `registry`/`resolution` from the slot's runtime | A sim Flow is built against the web node registry |
| 1549 | `startAutomationStudioBuildRouting({ hostRuntime: this.hostRuntime })` | A build observes route state through the wrong host |
| 1556 | `automationStudioHarnessOptionRegistry({ binding: this.llmEvidenceRuntime })` | Tools come from the one binding |
| 1570 | Answer First dispatch passes `binding: this.llmEvidenceRuntime`, `controlParameterKeys`, `stepLogPageText`, `continuingOptions` | The attempt runs on the slot's domain |
| 1571, 1597 | `flow_bootstrap.evidence_runtime_unavailable` checks the slot | |
| 1574, 1577-1578, 1583, 1604, 1608-1609, 1655-1656, 1687 | Trials, submission, loop, shown evidence, state digest, readRowsKey, deniedEvidenceKeys, dry-run, checklist arrival, plan parameter resolution: all from the slot | |
| 1765-1766, 3384-3385 | Registry and resolution from the slot's runtime | |
| 1920, 1969 | `compileFlowSource` and code checks use the slot's node registry | |
| 2063-2066 | `listNativeNodeDefinitions` filters the slot's definitions by the project's scope | The panel's node catalog shows only the slot's nodes |
| 2075-2100, 3657 | Recording proposals read the slot's mappers by `domainId` | Correct per domain, but only the slot's runtime is consulted |
| 387 (`executor:` and `binding:` entries) | The trial collaborators read `io`, `nativeNodeRuntime`, `hostRuntime` and `binding` from the slots | Every trial runs on the slot's domain |
| 2397 | `recoveryPorts` pass `llmEvidenceRuntime` and its `controlParameterKeys` | Repairs explore with the slot's tools |
| 2466 | Run admission's `pageHeld` uses `this.hostRuntime?.hostResources` | A sim run is admitted against the web browser's lease state |
| 2487 (fields 14-18) | `automationStudioRunGraphOptions({ io: this.ioRuntime, nativeNodeRuntime, hostRuntime })` | Every run executes through the slot's nodes and host |
| 2529 | `routeAutomationStudioRun({ hostRuntime: this.hostRuntime })` | |
| 2540, 2618 | `assertAutomationStudioRunRequirements({ domainId: this.ioRuntime?.domainId })` | Clients are filtered to the one IO domain |

### Service submodules that are handed a slot

- `service/runtime-session/graph-options.ts:85-88`: the effect dispatcher and output target preparer come from `bound.domainId`, and `authorizedDomainIds` is cut to the one bound domain. Lines 90-97 take the native executor, action-effect, refresh and capabilities from one runtime.
- `service/trial-ports/collaborators.ts:28,30`: `executor()` and `binding()` take no Flow argument.
- `service/trial-ports/registry-resolution.ts:12-16`: uses one runtime's `sdk.nodes`.
- `service/answer-first/flow-run/engine-of.ts:15`: `collaborators.executor().nativeNodeRuntime`.
- `service/project-parts/control-keys.ts:18`: `getTargetHooks(executor.io?.domainId)` reads the IO domain, not the Flow's.
- `service/project-build/brief-ports.ts:287`: `project.hostRuntime`.
- `service/runtime-session/in/run-repair.ts:162`: `input.ports.llmEvidenceRuntime?.deniedEvidenceKeys`.
- `service/runtime-session/page-held.ts:8,32-33`: one `hostResources`.
- `service/end-view/run-reader.ts:18-33`: takes a binding as an argument, which is correct, but its callers pass the slot.
- `service/fluxnode/create-fluxnode-service.ts:41,68` and `owner-flows.ts:48,139-142`:
  - one `domainId` for the owner project;
  - `spec.runtime` is parsed (`@fluxiq/contracts` `fluxnode/spec/definition.ts:40`) but nothing in `service/fluxnode/` reads it;
  - so today a spec with `runtime: "android"` on a web instance runs on the web.

### The `FluxIQ` instance (`packages/fluxiq/src/framework/index.ts`)

- **One active domain.** Lines 152, 168 and 177 hold it, and `activeHostDomainId` (486) falls back to `options.domains[0]`.
- **Storage paths follow it.** The domain storage paths (172-195) and storage inspection and migration hang off it.
- **The IO runtime takes it.** Line 205 calls `bindIoRuntime(this.io, activeDomainId)`.
- **One native runtime.** Lines 206 and 265-266 bind it through the service's slot.

### Server and host loading

- `server/cli/run-command.ts:30`: `createFluxNodeService({ domainId: fluxiq.activeDomainId })`.
- `server/host-module/host-domain.ts:9-14` (`soleHostDomainId`) and `server/cli/open-host-instance.ts:17-18`: one host module (`FLUXIQ_HOST_MODULE`), and its one domain becomes the active one.
- `apps/web` loads the same single module: `src/lib/fluxiq.ts`, `src/instrumentation.ts`, `src/app/product/server/ensure-platform-modules-loaded.ts`.

### Shared runtime state that is not per domain

- `runtime/native-nodes/native-node-runtime.ts`:
  - **90-96:** `stepLogPageText` asks every registered evidence summary and takes the first answer.
  - **122:** `resolveActionEffect` matches an output id across every manifest's definitions.
  - **43:** one set of grants per runtime object.
  - Harmless while one runtime object holds one domain, which is how this design uses it.
- `runtime/llm/domain-instructions/resolver.ts:20-31`: reads one binding when a provider is resolved, and has no input naming the Flow.
- `runtime/project-agents/host-resources/lease-scope.ts:19,40-47`: `strictlyHeld` is process-wide. A grant without a `sessionId` is "strict for every session", so a port of another runtime that grants without a session would make every web gateway session demand a lease while it is held. Scheduling itself is already per port (`runtime/project-agents/dispatch/host-lease.ts:9-18`, a WeakMap keyed by port), which is right.
- `runtime/llm/harness-options/registry.ts:328-332` (`scopeAllows`): a global-scope Flow is offered every domain's options. That is fine with one bound host. With several, a global Flow must resolve to exactly one bundle (the default).
- `engine/automation/frames/call-subflow.ts:89`: a called Flow runs under `parentOptions`, so it uses the caller's host and nodes. That is safe today, because `service/flows/writer.ts:115` forces every Flow's scope to equal its project's, so one project holds one runtime. It stops being safe if P6 lets one project hold `web/...` and `android/...` folders (O2).

### The simulated binding (`!FluxIQTestEnvironments/packages/fluxiq-binding/src/register/register.ts`)

- **Header (lines 5-7):** records the limit.
- **Lines 37-43:** call `bindRuntimeService`, `bindHostRuntime`, `bindAutomationStudioNativeNodeRuntime` and `bindLlmEvidenceRuntime`. These are the same four slots the web domain fills, so whichever registers last wins.

### The web domain registration (`!FluxIQWebExtension/domain/src`)

The entry is `host.ts:10-27` (`registerWebAutomationDomain`):
- it calls `registerDomain(webAutomationDomain)`;
- it registers the domain's IO;
- it registers the recording domain;
- `runtime/service.ts:8-31` (`registerWebAutomationRuntime`) registers the adapter `web-automation.gateway`, then `bindRuntimeService`, then `bindWebAutomationHostRuntime` (`runtime/host-runtime.ts:396-400`), then `bindWebAutomationLlmEvidenceRuntime` (`runtime/llm-evidence/tools.ts:569-579`);
- it binds the native runtime only if `nativeRuntimeSummary().bound` is false (`host.ts:23-25`).

`web-panel-host.ts:67` binds the native runtime with a build identity. The domain id is `web-automation` (`constants.ts:1`). The FluxNode runtime id for the web is `web`, so domain ids and runtime ids are not the same string and need an explicit map.

## (b) Target design

### b1. Runtime bundles and the registry

A new area, `packages/fluxiq/src/runtime/automation-runtimes/`, with one exported thing per file, a barrel and a `tests/` folder.

```ts
/** One runtime the engine can drive: everything Core needs from one domain, together. */
export type AutomationStudioRuntimeBundle = {
  runtime: string;                 // FluxNode runtime id, fluxNodeRuntimeSchema ("web", "android", "linux")
  domainId: string;                // the Flow scope's domain ("web-automation", "sim.android")
  evidence?: AutomationStudioLlmEvidenceRuntimeBinding;  // evidence.domainId === domainId
  host?: AutomationStudioHostRuntimeBoundary;
  nodes?: AutomationStudioNativeNodeRuntime;             // every manifest's domainId === domainId
  nodesIdentity?: TrustedModuleBuildIdentity | null;
};

export class AutomationStudioRuntimeBundles {
  readonly fallback: AutomationStudioRuntimeFallbackSlot;   // today's four slots, unchanged
  register(bundle: AutomationStudioRuntimeBundle): void;    // validated; see below
  forDomain(domainId: string | null): AutomationStudioRuntimeView;  // registered bundle, else the fallback
  forRuntime(runtime: string): AutomationStudioRuntimeView | undefined;
  list(): readonly AutomationStudioRuntimeView[];           // fallback first, then registration order
  get multiple(): boolean;                                  // any bundle registered beside the fallback
}
```

- **The fallback slot** holds:
  - `evidence`, `host` and `nodes`;
  - `io: { io, domainId }`.

  The existing `bindLlmEvidenceRuntime`, `bindHostRuntime`, `bindNativeNodeRuntime` and `bindIoRuntime` write into it exactly as they write the fields today. The constructor options do the same. Nothing about them changes.
- **A view** is `{ runtime, domainId, evidence, host, nodes, io }`. The fallback's view returns the same object references the slots hold. That identity is what makes the web path byte-identical, and a test asserts it with `toBe`.
- **`register` refuses:**
  - a `domainId` already registered, or equal to the fallback evidence binding's `domainId` or the fallback IO domain;
  - a `runtime` already claimed;
  - an `evidence.domainId` or a node manifest naming another domain;
  - a host or nodes object already held by another bundle or by the fallback (`runtime_bundle.shared_object`).

  Each refusal throws at registration, never at run time.
- **The fallback's runtime id.** It is the active domain manifest's optional new `runtime` field (`domains/index.ts` `DomainManifest`, additive). When absent, it is `undefined`, meaning "serves any runtime no bundle claims" (the compatibility rule for `forRuntime`).
  - Core never spells `web` to decide anything, so the web-vocabulary audit is unaffected.
  - The web domain can later declare `runtime: "web"`, which makes `forRuntime` strict (phase W).
- **Registration on the instance.** `FluxIQ.registerAutomationRuntime(bundle)` (`framework/index.ts`) also:
  - registers the domain's manifest if it is absent;
  - registers its runtime adapter, which `RuntimeService` already keys by `domainId`;
  - binds the runtime service if unbound.

  It never touches the fallback slots, the active domain or the trusted identity of the service. Its `nodesIdentity` is anchored on the bundle object (`bindTrustedModuleIdentity(bundle, identity)`). The diagnostics endpoint then lists `[fallback, ...bundles]` identities, with the fallback first, so the web host's identity report is unchanged.

### b2. How a run, a FluxNode and a Flow select their runtime

**The key is the Flow's scope.** `flow.scope.domainId`, which `service/flows/writer.ts:115` keeps equal to its project's `domainId`, so the project's domain is an exact, cheap proxy.

The service gets one private resolver (`service/runtime-selection/`, new):

```ts
runtimeFor(projectId: string | null | undefined): Promise<AutomationStudioRuntimeView> | AutomationStudioRuntimeView
```

- **No bundle registered:** it returns `bundles.fallback` synchronously, with no read at all. This is every instance today.
- **Bundles registered:** it reads the project's `domainId` once, caches it per project id (immutable after creation), and returns `bundles.forDomain(domainId)`. A null domain (a global project) gets the fallback, as today.

| Entry | Selects by | Where the view flows |
| --- | --- | --- |
| A build or repair (`generateFlowBootstrapAdaptation`, 1483-1700) | `request.projectId` | `registry/resolution` from `view.nodes`; routing from `view.host`; the harness registry, trials, submission, loop, Answer First dispatch and `continuingOptions` from `view.evidence` and `view.nodes` |
| A run (`runRuntimeSession`, 2455-2620) | `input.projectId`, resolved before `graphOptions` is built | `automationStudioRunGraphOptions({ io: view.io, nativeNodeRuntime: view.nodes, hostRuntime: view.host })`; admission's `pageHeld`, the router and the requirement gate (`domainId: view.domainId`) |
| A trial | the trial's `projectId` | `executor(projectId)` and `binding(projectId)`; `collaborators.ts` gains the argument |
| Recovery and in-run repair | the context's `projectId` | `recoveryPorts(context, view)` |
| Result check, judge, end view | the run's `projectId` | `run-reader.ts` is given `view.evidence`; providers are stamped per Flow (b4) |
| Chat | the thread's `projectId` | the domain instructions read per project (b4) |
| FluxNode | `spec.runtime` | `bundles.forRuntime(spec.runtime)`, else a refusal `fluxnode.runtime_unavailable` (an additive code). The owner project is per bundle domain (`FluxNodeOwnerFlows` keyed by `view.domainId`), so the Flow it creates has that scope and every row above follows from it |
| Pipeline (D3) | each called FluxNode's own spec | `fluxnode-flow-caller.ts` already starts a child FluxNode run, which selects by its own runtime, so a pipeline mixes runtimes freely |
| A Call Flow inside a run | same project, so the same runtime | Asserted: the executor refuses a callee whose scope domain differs from the run's view (`flow_call.runtime_mismatch`). It cannot happen while `writer.ts:115` holds; the assertion is for P6 |
| Panel node catalog and code compile (2063, 1920, 1969) | the project | `view.nodes` |

**The P6 tension.** O2 files Flows as `web/...` and `android/...`. If one project is to hold both, the Flow's scope must come from its own runtime rather than its project. In that case:
- `writer.ts:115` changes to "the Flow's scope is its runtime's domain";
- the selector reads `flow.scope` (cached per Flow id) instead of the project;
- cross-runtime Call Flow becomes a child run under the callee's bundle rather than a frame.

P2c works unchanged if P6 instead keeps one runtime per project and uses the runtime folder as the top level of a project tree. **This needs the lead's decision before P6 builds placement.** I recommend one project per runtime for the MVP: the extension's domain gate (`server/program-route/handle-program-request.ts:138-158`) already assumes it.

### b3. How hosts of different runtimes coexist

- **Leases.** One scheduler per host port already exists (`dispatch/host-lease.ts`), so two runtimes each have their own capacity and queue. Two fixes make them independent:
  1. **Strictness is per domain.** `AutomationStudioHostLeaseScope` takes the bundle's `domainId`. `gatewaySource.requiresLease(sessionId)` counts a held lease only when the lease's session is that session, or, for a session-less grant, when the session's declared domain (`ClientGatewaySession` hello `metadata.domainId`) is the lease's domain.
     - Today a session-less grant blocks every session. A remote sim worker's port could then block the extension's chat commands.
     - Files: `runtime/project-agents/host-resources/lease-scope.ts`, `runtime/project-agents/dispatch/host-lease.ts` (key the scope by port and domain), and `client-gateway/service/host-lease/` (pass the session's domain).
     - Web ports always set `sessionId` (`domain/src/runtime/host-resources/port.ts:51`), so web behaviour is unchanged.
  2. **Admission reads its own run's port.** `pageHeld` (2466) reads `view.host?.hostResources`, never the fallback's.
- **Pairing.**
  - Already per domain. A trusted client is approved for the domain its hello declared (`@fluxiq/contracts` `client-gateway.ts:600-605`). A paired client reaches only projects of its domain (`handle-program-request.ts:133-157`). A `worker` client type exists (`client-gateway.ts:24`).
  - A remote simulated host (N10, later) connects as `clientType: "worker"` with `metadata.domainId: "sim.android"` and its own capability ids. Its bundle's host boundary dispatches only to sessions that declare that domain, as the web domain's `WEB_AUTOMATION_SESSION_CRITERIA` already does (`clientType: "extension"` and `web.actions`).
  - Nothing in pairing changes for P2c. In-process sim hosts need no pairing at all.
- **Worker hosts.**
  - **P2c:** in-process bundles only (the sim binding's native adapter).
  - **Remote:** a gateway `worker` that serves a runtime is a later phase (P11/N10 cloud). It needs only:
    - a bundle whose host and evidence dispatch through `clientGateway.executeAction(sessionId, ...)` filtered by domain;
    - a host-resource port per worker that names its `sessionId`.
- **Several host modules.**
  - `FLUXIQ_HOST_MODULES` (a path list) is added beside `FLUXIQ_HOST_MODULE`:
    - the first module is the fallback, exactly as today;
    - each further module registers through `registerAutomationRuntime`;
    - `soleHostDomainId` keeps its meaning for the first.
  - Files: `server/host-module/*`, `server/cli/open-host-instance.ts`, `server/cli/dev-arguments.ts`.
  - The three `apps/web` loaders follow later, after t901.

### b4. What the model sees, per runtime, with no leak

Every model-facing input comes from the run's view, never from the fallback:

| Model input | Today's source | After |
| --- | --- | --- |
| Tool list and page or screen views | `harnessOptions` from the slot's binding | from `view.evidence`. The harness registry is built per build, so two concurrent builds hold two registries |
| Node catalog (`core.run_node` enum, `describe_nodes`) | the slot's `sdk.nodes` filtered by scope | `view.nodes`. One runtime object holds one domain, so `stepLogPageText` and `resolveActionEffect` see only that domain |
| Domain system instructions | the resolver wrapped with `() => slot` | `automationStudioLlmResolverWithDomainInstructions(resolver, (input) => bindingFor(input.projectId))`. Both resolver inputs carry `projectId` (`runtime/llm/resolver-contract.ts:20-22`, `service/runtime-adaptation/result-check.ts:31-33`). The lookup is async and already inside an async wrapper. With no bundles it returns the slot synchronously |
| Script format examples and guidance | `submission.binding` | the view's binding (unchanged code below the service) |
| Denied evidence keys, observed state keys, `readRowsKey` | the slot | the view's binding |
| Chat interpreter's domain text | `bindDomainInstructions(() => text)` | `bindDomainInstructions((projectId) => text)` (`runtime/conversations/conversations.ts:379`) |
| Step log `page.txt` | the slot's `stepLogPageText` | `view.nodes.stepLogPageText` |

**A tripwire for missed call sites.** In `multiple` mode only, the fallback binding and host are wrapped in a guard (`runtime/automation-runtimes/fallback-guard.ts`). The guard refuses, with `runtime_bundle.cross_domain_use`, any call whose `projectId` belongs to a registered bundle's domain. Two existing checks back it up:
- the harness registry's `scopeAllows` already hides domain-scoped options from another domain's Flow;
- the build then fails `evidence_runtime_unavailable`.

The wrapper exists only when bundles are registered, so the web-only path keeps the raw objects.

**Core's own prose is shared, and it is web-flavoured.** About 38 model-facing strings in `runtime/result-verification` and 11 in `runtime/answer-first` say "the site" or "the page". This is not one runtime's guidance leaking into another's, but it is web vocabulary told to an Android model. Two steps:
- **Interim (no Core change):** the sim binding's `systemInstructions` (`fluxiq-binding/src/evidence/instructions.ts`) say once that "the site" means the device and "the page" the screen now shown. P8a's proof passed with this vocabulary.
- **Phase V (after t905 and t885):** a bundle may supply `medium: { place, whole }` words. Core's text takes them through one helper whose default is today's exact words, so every web string is byte-identical and the goldens enforce it.

### b5. The judge and checks stay runtime-neutral

- **The judge reads the result through the run's own binding.** That is `observeResult`, or else the free look, in `service/end-view/run-reader.ts`. The service passes `view.evidence` instead of the slot.
- **Result checks read rows, datasets, act records and the instruction.** None of these is a domain (`runtime/result-verification`, `runtime/answer-first`).
- **What a judge model sees from a domain** is only that domain's instructions (b4) and that domain's view text.
- **No judge code branches on a domain id, and none may.** Phase V's medium words are data the bundle supplies, never a branch.
- **The FluxNode `check(summary)` hook** (P2a) is the caller's code and is neutral already.

### b6. What the web domain and the extension must change

**Nothing, for P2c.** The web domain keeps calling the four existing binds and fills the fallback slot exactly as today. `nativeRuntimeSummary()` keeps meaning "the fallback is bound", so `host.ts:23` stays correct. The extension (`apps/extension`) is untouched. Its paired session already declares `web-automation`, and its projects are `web-automation` projects, which no bundle claims.

**Phase W, optional and later:**
- **Strict FluxNode runtime check.** Add `runtime: "web"` to the web domain manifest, so `forRuntime("android")` on a web-only instance refuses instead of running on the web. Today it silently runs on the web; that is a latent bug, not web behaviour. The change also adds `runtime` to the domain summary JSON the panel lists. That is a visible, additive change and is not on the web model path.
- **Leave the fallback (no date).** Move from the four binds to one `registerAutomationRuntime`. There is no reason to do this before the cloud.

## (c) Migration that keeps the web byte-identical, and how to prove it

1. **No behaviour change first (phase 4a).** Every slot read in the service is routed through the registry's fallback (`this.runtimes.fallback.*`), with no selection yet.
   - The test is that the existing suites pass unchanged, and the goldens below match.
   - This step is mechanical and separable, so a reviewer can check it line for line.
2. **Selection second (phase 4b).** Each entry point asks `runtimeFor(projectId)`. With no bundle registered, this returns `fallback` synchronously.
3. **Proof of byte identity: three independent checks.**
   - **Structural.**
     - With no bundles, `runtimeFor(x)` returns the slot objects themselves (`toBe`) for every `x`: global, web domain, unknown domain, null.
     - A spy on the project store proves zero extra reads.
     - The resolver wrapper returns the same provider object path as today.
   - **Golden provider requests (phase 0).** A recording provider decorator (test-only) writes each request's canonical JSON:
     - the system message, including domain instructions;
     - the tool list;
     - the evidence and the decision schema;
     - with ids and timestamps normalised.

     Goldens are written from today's code for:
     - Core's provider-free Answer First suites on the fake library (`service/answer-first/tests/*`: an attempt, a later attempt, a judge ending, a repair);
     - the web domain's scripted service tests (`domain/src/runtime/tests/carried-service-repair.test.ts`, `carried-row-service-repair.test.ts`, `llm-evidence/tests/tools.test.ts`).

     After phases 4a and 4b, the goldens must match byte for byte. Lanes t885, t902 and t905 legitimately change requests, so the goldens are **re-baselined on `dev` right before phase 4 starts**, after those lanes merge. They are never edited by phase 4 itself.
   - **Step logs from one provider-free Lab run.** One provider-free deterministic run (`lab attempt --attempts 4`, on one of the ten realistic scenarios) runs on the Core commit before phase 4 and on the commit after. The diff of every `steps/NNNN-*/request.json` and `page.txt` must be empty apart from run ids and times.
     - Provider-free: no model calls and no spend. It needs the lead's go, because it opens a headed browser.
4. **Cost to the web path.**
   - Web-only instance: one boolean read (`bundles.multiple`) per entry point; no I/O, no allocation of new wrappers, and identical object identity.
   - Web plus sims on one instance (development, tests): one cached `Map` lookup per entry, and one project read the first time each project is seen. The tripwire wrapper adds one property check per fallback call.

## (d) Phased build steps

Every phase follows Core's code structure:
- one export per file, with barrels;
- tests in `tests/` beside their subject;
- no import of a domain;
- the structure audit passes.

"Proof" means a provider-free test that makes no model call.

| Phase | Owner (tier) | Files | Tests and provider-free proof | Can start |
| --- | --- | --- | --- | --- |
| **0 Golden request harness** | worker | new `framework/automation-service/service/answer-first/tests/request-golden/` (recorder plus goldens), new `!FluxIQWebExtension/domain/src/runtime/tests/request-golden.test.ts` | The goldens are generated and pass twice in a row, which shows they are deterministic | **Now** (harness). Baseline regenerated at phase 4's start |
| **1 Runtime bundle registry** | worker | new `runtime/automation-runtimes/` (bundle type, registry, view, validation, fallback slot, fallback guard) plus a row in `docs/architecture/runtime-ownership.md` | Unit: the refusals in b1; the fallback identity (`toBe`); `forRuntime` compatibility and strict modes; the guard refuses cross-domain use and is absent with no bundles | **Now** |
| **2 Lease strictness per domain** | worker-heavy (concurrency) | `runtime/project-agents/host-resources/lease-scope.ts`, `runtime/project-agents/dispatch/host-lease.ts`, `client-gateway/service/host-lease/*` | A session-less grant for domain A does not make domain B's session require a lease; web leases (with a session id) behave as before; the existing lease suites pass | **Now** |
| **3 Per-Flow instructions and chat** | worker | `runtime/llm/domain-instructions/resolver.ts` (a lookup taking the resolver input; the old zero-argument form kept), `runtime/conversations/conversations.ts` (`bindDomainInstructions` per project) | Two bindings with different instructions: a provider resolved for project A carries A's text, for B carries B's; the zero-argument form is byte-identical (the existing `domain-instructions/tests` pass) | **Now** (module side). Call sites go in phase 4 |
| **4a Route slot reads through the fallback** | worker | `framework/automation-service/service.ts` (call sites only; the line count stays flat for the audit's ratchet), `service/trial-ports/collaborators.ts`, `registry-resolution.ts`, `answer-first/flow-run/engine-of.ts`, `project-parts/control-keys.ts`, `project-build/brief-ports.ts`, `runtime-session/{graph-options,page-held}.ts`, `runtime-session/in/run-repair.ts`, `end-view/run-reader.ts` callers | Every existing suite in the touched directories, the goldens, the typecheck and the audit pass | **After t898 and t902 merge** (both edit `service.ts` or `runtime-session/`). Also after t885, if it edits the Answer First dispatch in `service.ts` |
| **4b Selection by Flow** | worker-heavy | new `service/runtime-selection/` (the project-domain cache and `runtimeFor`); the same files as 4a; `service.bindRuntimeBundles`/`registerRuntime` | **Core proof:** one `AutomationStudioService`, Core's fake library bound through the fallback slots, and a second in-test domain registered as a bundle. Two scripted Answer First attempts run **concurrently** (`Promise.all`), and each asserts: it reached its result; its provider requests held only its own tools, node enum and instructions; its acts landed only on its own fixture; its run used its own host (spied). The goldens and the step-log diff stay identical | After 4a, in the same merge window |
| **5 Instance API and host modules** | worker | `framework/index.ts` (`registerAutomationRuntime`), `domains/index.ts` (optional `runtime` on the manifest), `server/host-module/*`, `server/cli/{open-host-instance,dev-arguments,run-dev}.ts` | `FLUXIQ_HOST_MODULES` with two fake modules: the first is the fallback and active domain, the second a bundle; `fluxiq dev` prints both; a single module behaves as today | **Now** for `framework/` and `server/` (no lane holds them). The `apps/web` loaders wait for **t901** |
| **6 FluxNode runtime selection** | worker | `service/fluxnode/{create-fluxnode-service,owner-flows,run-fluxnode}.ts`, `server/cli/run-command.ts`, `@fluxiq/contracts` `fluxnode` refusal code (an additive minor bump) | The SDK over loopback runs a `runtime: "android"` node and a `runtime: "web"` node on one engine at once; each Flow lands in its own owner project; an unclaimed runtime is refused with `fluxnode.runtime_unavailable` once the fallback declares its runtime | After 4b and 5 |
| **7 Call Flow runtime assertion** | worker | executor-side check at the child-graph load in `service/runtime-session/subflow-frame.ts` | A callee with another scope is refused before any step; same-scope calls are unchanged | **After t902** (owns `runtime-session/`) |
| **8 Sim binding on the new API** | worker (`!FluxIQTestEnvironments`) | `packages/fluxiq-binding/src/register/register.ts` (`registerAutomationRuntime`, `runtime: kind`), new `src/tests/multi-runtime.test.ts` | **Proof:** Android and Linux sims on one instance, two concurrent scripted attempts, both `achieved/confirmed`, both oracles pass, no cross-tool in either provider log | After 5 (Core build) |
| **9 Web and simulated Android on one engine** | worker-heavy | see the note below | **The requested proof:** one engine instance runs a web build (on a fake in-process gateway host, no browser) and a simulated Android attempt concurrently. Both reach results; the web requests equal the web goldens byte for byte; the Android requests contain no web text | After 4b, 5 and 8 |
| **V Runtime medium words** | worker-heavy | `runtime/result-verification/*`, `runtime/answer-first/*` text through one helper | The web goldens are unchanged, and a sim run's judge prompt says "screen" and "device" | **After t905 and t885 merge** |
| **Docs** | lead | `docs/architecture/runtime-ownership.md` ("One engine, several runtimes"), `package-boundaries.md` migration note, the `fluxnode-plan.md` P2c row and N10 | n/a | With 4b |

**Where phase 9's proof lives (a decision for the lead).** It is the only place that holds both the real web domain and the real sim package.

- **Option 1 (recommended):** the extension repository's `packages/test-runner` gains `link:` devDependencies on `!FluxIQTestEnvironments/packages/{fluxiq-binding,android,sim-kit}`, as `fluxiq-binding` already links Core by relative path. The test is not a Lab run and opens no browser, so the ten-scenario rule does not apply.
- **Option 2:** phase 4b's Core-only proof, plus phase 8, plus the web goldens. Together they cover the same claims without a cross-repository link, but never run real web code and real sim code in one process.

### Conflict map against the lanes now editing Core

| Lane | Its files | P2c phases that collide | Ruling |
| --- | --- | --- | --- |
| t902 | `engine/automation` graph-run, resume, step-loop; `automation-service` `runtime-session`, run-ending | 4a, 4b (`runtime-session/graph-options.ts`, `page-held.ts`, `in/run-repair.ts`), 7 (`subflow-frame.ts`) | Wait for the merge. P2c needs no `engine/automation` edit: the executor already takes host and nodes per run |
| t905 | Answer First rows, the new result folder, `result-verification` | V (prose); the phase 0 goldens (requests change) | V waits. Rebaseline the goldens after its merge. 4b passes `view.evidence` to `end-view/run-reader.ts`, not into `result-verification`; no clash expected, but confirm the new result folder does not read the binding slot |
| t898 | `engine/automation/pacing`, `service.ts`, `run-requests`, `server/program-route`, `identity-access` | 4a, 4b (`service.ts`) | Wait for the merge. Separately: pacing that is learned or tuned per site should be per runtime later; ask t898 whether `AutomationStudioLearnedPaces` is keyed by location (unverified) |
| t901 | `platform/iam`, `programs/secret-keys`, `identity-access`, `apps/web` | 5's `apps/web` loaders only | The `framework/` and `server/` parts of 5 start now; `apps/web` waits |
| t885 | Answer First attempt and loop-signal, `runtime/llm` evidence-loop, repeat-guard, evidence-recall | 4a, 4b if it edits the dispatch at `service.ts` 1570; V; the goldens | 3 is safe (`domain-instructions/` and `conversations/` are not its files). Rebaseline the goldens after its merge |

**Start now:** 0 (harness), 1, 2, 3, and 5 without `apps/web`. These are disjoint from every lane and from each other, so four workers can run in parallel.

**Then:**
- 4a and 4b once t898, t902 and t885 have merged;
- 6, 7 and 8 after 4b;
- 9 last;
- V after t905 and t885.

## (e) Risks

- **Core never imports a domain.**
  - The registry holds opaque bundles. Core code compares only domain and runtime ids that registrations supply, and never spells `web-automation`, `sim.*` or `web` in a decision. The fallback's runtime comes from the manifest.
  - `scripts/structure-audit/rules/web-vocabulary.mjs` and `importBoundaries` stay green.
  - Phase 9's test lives downstream, which may import both sides.
- **A missed call site silently uses web pieces for a sim Flow.** This is the main risk, given about 45 read sites in `service.ts`. Mitigations:
  - the mechanical 4a step;
  - the fallback guard in `multiple` mode, which fails closed with `runtime_bundle.cross_domain_use`;
  - the existing `scopeAllows` option filter;
  - a unit test that greps `service.ts` for `runtimes.fallback.` outside the bind methods and `runtimeFor`.
- **Shared mutable state across concurrent runs.** Audited:
  - lease strictness (phase 2);
  - the trusted identity (anchored per bundle);
  - `stepLogPageText` (one runtime object per domain).

  Not audited: `AutomationStudioLearnedPaces`, `prepareCandidateStart` (one Lab reset per service; should become per bundle when a sim Lab arrives), `buildCancellation` (keyed by project and Flow, looks safe), and reusable LLM context (per project, looks safe).
- **P6 and O2.** If one project is meant to hold several runtimes, selection must move from the project to the Flow's scope, and Call Flow across runtimes becomes a child run. Decide before P6 builds placement (b2).
- **Storage paths.** The active domain still sets `.fluxiq/domains/<id>`. Bundles get no domain storage directory in P2c; sims need none. A real Android host with its own config needs `domainData` per bundle later.
- **The judge's vocabulary** stays web-flavoured until phase V. Measured only for the sims' scripted proofs. A live Android model may read "the site" oddly. The interim gloss is the sim's own guidance, so nothing leaks into the web.
- **Cost to the web path.** None measurable in web-only mode (b-c). In mixed mode it is one cached lookup per entry. The goldens and the step-log diff are the guard.
- **Golden churn.** Three lanes legitimately change requests, so a baseline taken too early would mask phase 4's diff with theirs. The baseline is taken on the post-lane `dev`, immediately before 4a, and phase 4 may not touch it.
- **Domain-id normalisation.** `normalizeDomainId` (`domains/index.ts:112-114`) lowercases and maps other characters to `_`. Bundles must be stored and looked up by the normalised id, or `sim.Android`-style ids miss.

## Commands run and observed results

Reads only: `grep`, `sed`, `cat` and `wc` over the three repositories, through the Bash and Grep tools. Nothing was built, tested, run or committed.

## Not verified

- I did not read lanes t898, t902, t905, t885 and t901's actual diffs. The conflict map uses the file sets the brief gave. In particular, whether t885 or t898 edits `service.ts` near the build dispatch (1483-1700) or the run path (2455-2620) is assumed, not seen.
- I did not read whether `AutomationStudioLearnedPaces`, the reusable LLM context and the trial environment's `prepareCandidateStart` hold state that a second runtime would disturb.
- The count of web words in model-facing strings is a regular-expression estimate.
- I did not check whether a provider-free Lab run is available as a command that opens no paid path. Phase (c)3's step-log diff assumes `lab attempt` has a provider-free mode, as the AGENTS file implies.
- The FluxNode HTTP handler (`server/fluxnode-api/`) was not read beyond confirming that it names no domain.

## Open questions or contradictions found

1. **O2 against `writer.ts:115`.** O2's paths (`web/...`, `android/...`) suggest one project spans runtimes, but Core forces a Flow's scope to equal its project's. The lead should decide one project per runtime (recommended) or per-Flow scope, before P6.
2. **Domain id and runtime id are different strings** (`web-automation` against `web`). The design maps them through the bundle, or through the fallback manifest's new optional `runtime` field. The alternative, renaming the web domain to `web`, would change stored project scopes and is rejected.
3. **Where phase 9's proof lives.** Either the extension's test-runner links the sim packages (cross-repository devDependency), or the Core-only and sim-only proofs together stand in for it.
