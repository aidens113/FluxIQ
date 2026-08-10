# Automation Studio Importer Guide

Importing repositories provide domain facts. FluxIQ infers task relevance from
recordings. Do not encode whether a state value is important, critical, or a
task condition in the importer; the framework mines that from timing around
actions.

## Responsibilities

Importing repositories define:

- recording domain IDs and accepted event types;
- payload and metadata schemas for those event types;
- reducers that turn domain events into state snapshots;
- factual state element descriptors for text, static IDs, selectors, statuses,
  routes, counts, visibility flags, and other observable values;
- optional observation extractors for additional raw observations.

FluxIQ defines:

- raw and normalized recording persistence;
- raw facts and domain-shaped observations;
- state/action correlations;
- evidence claims with confidence;
- proposed task policies from mined claims.
- reviewer-gated Flow/node proposals produced by importer recording mappers.

## Domain Registration

Register a domain with `AutomationStudioService.registerRecordingDomain`.

```ts
automationStudio.registerRecordingDomain({
  domainId: "example.checkout",
  label: "Checkout",
  schemaVersion: "0.1",
  events: [
    {
      eventType: "submit.clicked",
      label: "Submit clicked",
      payloadSchema: {
        type: "object",
        properties: {
          targetText: { type: "string", label: "Target text" },
          targetTestId: { type: "string", label: "Target test ID" }
        }
      },
      stateReducer: ({ event, previousState }) => ({
        state: {
          timestamp: event.timestamp ?? Date.now(),
          namespaces: {
            ...previousState.namespaces,
            order: {
              schemaId: "example.checkout",
              schemaVersion: "0.1",
              values: {
                status: {
                  type: "string",
                  value: "submitted",
                  observedAt: event.timestamp ?? Date.now()
                }
              }
            }
          }
        }
      })
    }
  ],
  statePaths: [
    {
      namespace: "order",
      path: "status",
      type: "string",
      elementKind: "status",
      label: "Order status"
    }
  ]
});
```

## State Element Descriptors

State descriptors are factual. They tell FluxIQ what kind of data a path holds,
not whether that data is relevant.

Supported `elementKind` values:

| Kind | Use |
| --- | --- |
| `text` | Visible or meaningful text. |
| `static_id` | Stable public IDs such as test IDs or content IDs. |
| `internal_id` | Internal IDs that identify entities but may not replay. |
| `selector` | CSS/XPath/automation selectors. |
| `label` | User-facing labels for controls or entities. |
| `status` | Domain status or progress values. |
| `route` | App route or screen identifier. |
| `url` | Full or partial URL. |
| `visibility` | Whether something is visible/present. |
| `enabled` | Whether an action target is enabled. |
| `count` | Numeric count, total, inventory, quantity, or progress number. |
| `position` | Coordinates. Usually treated as low-value unless domain-specific. |
| `bounds` | Rectangles/bounding boxes. Usually low-value alone. |
| `collection` | Lists or sets of entities. |
| `json` | Structured data that needs domain-specific interpretation. |
| `unknown` | Fallback when no better factual kind is known. |

Use descriptors for stable, inspectable values. Avoid pointer movement, hover
state, volatile animation positions, raw timestamps, and private/sensitive
values unless they are explicitly needed.

## Mining Behavior

FluxIQ mines each normalized recording as:

```text
facts
  normalized events and state deltas
observations
  readable action/state observations
state-action correlations
  state present before actions and state changed after actions
claims
  inferred preconditions, effects, waits, transitions, and candidate targets
Policy Flow proposals
  policy regions linked back to supporting claims
```

Finalized recordings are processed automatically by the framework when the
recording has a project owner. Automation Studio normalizes the recording,
mines evidence, and creates a Policy Flow proposal unless a current proposal already
exists. Importers should focus on factual event/state quality; they do not need
to call each mining stage directly in normal operation.

Recordings that are meant to contribute to the same policy should use the same
compatibility `taskId` when the recording session is created. FluxIQ carries
that policy key through normalization, mining, proposal generation, and Flow
approval; new importing repos should treat it as correlation metadata, not as
a Task artifact ID. When multiple approved proposals target the same canonical
Flow, the framework reuses
matching leading steps and branches at the first divergent proposed step.

In the web panel, stopping or finalizing a recording refreshes the timeline
automatically and shows stage progress while derived data is being created. The
generated proposal appears under Proposals in the project hierarchy and remains
a draft until the user explicitly approves or applies it. Regeneration keeps
one current proposal per recording and rewrites that proposal artifact rather
than adding duplicate proposal rows. Deleting a recording deletes its generated
proposal.

Each proposal contains a preview policy graph and a mergeable graph patch. The
importing repo does not define patch criticality, confidence, or merge rules;
it only supplies factual events, factual state, stable IDs/text/selectors, and
the policy correlation key. Proposal edits are cached by FluxIQ as workspace
state until the user explicitly applies the proposal to an existing canonical
Flow or saves it as a new Flow. Only that explicit action writes or updates the
canonical Flow on the server side.

The importer should expose enough factual state for the framework to compare:

- state before an action;
- state after an action;
- values that appeared, disappeared, or changed;
- stable text/IDs/selectors that identify action targets;
- status/count/visibility/enabled values that show effects or readiness.

## Storage

Pipeline artifacts are internal recording-owned derived files. The user-facing
UI exposes generated proposals and timeline evidence inspection, but FluxIQ
stores the underlying evidence as:

```text
recordings/sessions/{recordingId}/derived/
  index.json
  normalization/
    timelines/{normalizedTimelineId}.json
    reviews/{reviewId}.json
  evidence/
    mining-runs/{miningRunId}.json
    facts/{factId}.json
    observations/{observationId}.json
    correlations/{correlationId}.json
    claims/{claimId}.json
  proposal/
    proposal.json
    flows/{proposalId}.json
```

Project indexes live under `indexes/` and contain references only. Deleting a
recording removes its session folder, derived evidence, and generated proposal.

## Practical Guidance

Start with a small, factual state surface:

- current route or screen ID;
- visible page/screen title;
- action target label/text;
- stable target test ID or selector;
- main domain status;
- count values that matter to the workflow;
- visible error/success text;
- enabled/visible flags for primary controls.

## Recording Mappers and Flow Proposals

Recording mappers are optional importer-owned semanticizers. They receive one
domain-neutral recording observation at a time and may return output-action
candidates. A candidate must name a registered output and may retain its source
input, confirmation expectation, parameters, confidence, and evidence links.

```ts
const manifest: AutomationStudioImporterSdkManifest = {
  // package/domain identity and nodes omitted
  recordingMappers: [{
    id: "recorded-click",
    version: "1.0.0",
    description: "Maps the importing application's recorded click event.",
    outputIds: ["click-element"]
  }]
};

const bundle: AutomationStudioImporterImplementationBundle = {
  packageId: manifest.packageId,
  packageVersion: manifest.packageVersion,
  implementations: {},
  recordingMappers: {
    "recorded-click": (observation) => {
      if (observation.type !== "observation" || observation.payload.inputId !== "element-clicked") return null;
      return {
        outputId: "click-element",
        parameters: { selector: observation.payload.selector },
        sourceInputIds: ["element-clicked"],
        expectedConfirmation: { inputId: "element-clicked", timeoutMs: 5_000 },
        confidence: 0.92
      };
    }
  }
};
```

Core rejects undeclared or unregistered outputs and rejects source or
confirmation inputs unless they are registered with `role: "action"`. Those
input events continue to arrive during recording/runtime and can confirm an
output, but every stored candidate has `policyStateEligible: false`; they can
never become policy state.

Generated proposals are inert until reviewed. Approval may append fixed
`builtin.policy.action` nodes to an explicit Flow, create project-private node
definitions, or create public definitions shared with projects in the same
global/domain scope. The Flow/node stores immutable mapper, observation, and
evidence provenance. Editing the Flow does not rewrite the raw recording.

Changing/removing the mapper version, its declared output set, an output
adapter, or an action-role source input invalidates dependent proposals.
Invalidated definitions disappear from the palette/runtime materialization and
dependent Flow catalog entries receive `recordingProposalWarnings` metadata.

Do not mark these as critical. Let FluxIQ infer importance by seeing which
values consistently lead to or follow recorded actions.

## Importer SDK and Native Nodes

Importer manifests are serializable display and validation contracts. Merely
registering a manifest never loads a file or executes its implementation. The
host must explicitly bind the exact package ID and version:

```ts
import {
  AutomationStudioNativeNodeRuntime,
  type AutomationStudioImporterSdkManifest
} from "fluxiq/automation-studio";

const manifest: AutomationStudioImporterSdkManifest = {
  schemaVersion: "0.1",
  sdkVersion: "0.1",
  packageId: "example.checkout",
  packageVersion: "1.0.0",
  domainId: "example.checkout",
  nodes: [{
    schemaVersion: "0.1",
    id: "example.checkout.calculate-total",
    version: "1.0.0",
    label: "Calculate total",
    description: "Calculates a checkout total.",
    category: "Checkout",
    source: { kind: "code", moduleId: "nodes/calculate-total.ts", implementationKey: "calculate-total", trust: "trusted-local" },
    availability: { kind: "domain", domainId: "example.checkout" },
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "subtotal", label: "Subtotal", valueType: "number" }],
    outputs: [{ id: "total", label: "Total", valueType: "number" }],
    parameters: [],
    safety: { requiredPermissions: ["checkout.calculate"], runtime: { secretHandles: ["tax-service"] } },
    editor: { color: "#2563eb" }
  }]
};

const nativeRuntime = new AutomationStudioNativeNodeRuntime({
  permissions: ["checkout.calculate"],
  secretHandles: ["tax-service"]
}).register(manifest, {
  packageId: "example.checkout",
  packageVersion: "1.0.0",
  implementations: {
    "calculate-total": ({ inputs, log }) => {
      log({ level: "info", message: "Calculated checkout total" });
      return { outputs: { total: Number(inputs.subtotal) * 1.1 } };
    }
  }
});

automationStudio.bindNativeNodeRuntime(nativeRuntime);
```

When the web panel is serving Automation Studio, bind the same runtime from the
host module loaded through `FLUXIQ_HOST_MODULE`. The registration must be
synchronous:

```ts
import {
  AutomationStudioNativeNodeRuntime,
  type FluxIQ
} from "fluxiq";

export function registerFluxIQHost(fluxiq: FluxIQ): void {
  const nativeRuntime = new AutomationStudioNativeNodeRuntime({
    permissions: ["checkout.calculate"],
    secretHandles: ["tax-service"]
  }).register(manifest, {
    packageId: "example.checkout",
    packageVersion: "1.0.0",
    implementations: {
      "calculate-total": calculateTotal
    },
    recordingMappers: {
      "checkout-click-mapper": mapRecordedCheckoutClick
    }
  });

  fluxiq.bindAutomationStudioNativeNodeRuntime(nativeRuntime);
}
```

If proposal generation reports that it needs a bound importer runtime, the web
runtime loaded the recording and IO registry but did not receive this native
runtime binding. Check `FLUXIQ_HOST_MODULE` and the runtime status panel before
debugging mapper output IDs.

The implementation receives only declared input-port values, immutable
parameters, an abort signal, declared grants, and a redacted logger. Timeout is
configured on the node instance with `metadata.timeoutMs` and defaults to 30
seconds. Returned values outside declared output ports fail the node.

This runtime is **trusted-local Node.js, not a sandbox**. Permission checks are
an authorization and audit boundary; they cannot contain a malicious module
that directly uses Node.js globals or closes over privileged host objects. Only
bind code trusted at the same level as the importing application.

Importer action nodes declare an `outputAction` contract and return a
`policy.output.dispatch` effect. FluxIQ validates the output ID and routes the
effect through registered IO output and confirmation handling. Trusted Code
Nodes cannot emit output-action effects. Neither native nor Code Nodes can
reclassify an action-bound input as policy state.
