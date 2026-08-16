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
- optional state presentation hints and visual frames that reconstruct what
  the automation saw using importer-owned content, coordinates, and bounds;
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

Descriptors and observed `StateValue` records may include optional
presentation metadata. Presentation metadata can provide labels, grouping,
icons, display ordering, a generic visual kind, and an evidence anchor. Anchors
are domain-neutral references such as points, bounds, element IDs, entity IDs,
regions, or paths. They tell the State View where a fact appears in the
reconstructed world; they do not tell FluxIQ whether that fact is important.

## State Visual Frames

Importers can attach visual frames to a `StateSnapshot` so the State View can
render what the automation saw. A visual frame declares a coordinate space and
JSON-safe layers such as images, text, regions, and elements. The importing
repo owns the content and semantics; FluxIQ validates the frame, renders a
generic reconstruction, and overlays mined evidence.

Image layers must use Automation Studio object or API references. The preferred
portable form for project-owned images is
`automation-object://project/<projectId>/<sha256>`. The web State View resolves
that reference to
`/api/programs/automation-studio/state-assets/<projectId>/<sha256>`, which
authenticates the user, requires `programs.read`, checks that the object belongs
to the requested project, and serves only renderable asset media types. Broken,
missing, or unauthorized refs appear as placeholders. Do not put absolute
filesystem paths, `file://` URLs, private screenshots, untrusted remote image
URLs, or domain assets into the FluxIQ framework repository.

Importers that capture screenshots should upload them before storing the
snapshot. Compute the SHA-256 digest of the image bytes and `PUT` the bytes to
`/api/programs/automation-studio/state-assets/<projectId>/<sha256>` with a
`Content-Type` of `image/png`, `image/jpeg`, `image/webp`, or `image/gif`. The
route accepts either an authenticated web session with `programs.write` or a
paired client-gateway bearer token. It rejects uploads larger than 20 MiB,
verifies that the uploaded bytes match the digest in the URL, and returns:

```json
{
  "ok": true,
  "payload": {
    "sha256": "<sha256>",
    "size": 12345,
    "mediaType": "image/png",
    "contentRef": "automation-object://project/<projectId>/<sha256>",
    "apiPath": "/api/programs/automation-studio/state-assets/<projectId>/<sha256>"
  }
}
```

Use the returned `contentRef` as an optional background image layer. Element
boxes, labels, controls, and evidence anchors should still be sent as structured
facts and frame layers so FluxIQ can draw selectable overlays, filter evidence
roles, and style matches/mismatches independently of the screenshot pixels.
Screenshots and full-document state use different coordinate kinds inside one
combined State View canvas. Screenshot frames should describe the visible
viewport and use viewport pixel coordinates:

```ts
{
  id: "screen",
  label: "Viewport Screenshot",
  coordinateSpace: { width: viewportWidth, height: viewportHeight, unit: "px", origin: "top-left" },
  metadata: {
    frameKind: "viewport-screenshot",
    scrollX,
    scrollY,
    documentWidth,
    documentHeight
  },
  layers: [
    {
      id: "screenshot",
      kind: "image",
      contentRef,
      boundsKind: "screenshot",
      bounds: { x: 0, y: 0, width: viewportWidth, height: viewportHeight }
    },
    {
      id: "element.deposit.viewport",
      kind: "region",
      statePath: "web.elements.deposit",
      boundsKind: "screenshot",
      renderKind: "screenshot-bbox",
      isVisibleOnViewport: true,
      bounds: { x: 412, y: 240, width: 93, height: 38 }
    }
  ]
}
```

Facts that represent page elements may also carry full-document anchors. Those
anchors use document pixels and remain valid even when the element is outside
the current screenshot:

```ts
presentation: {
  label: "Deposit",
  anchor: {
    type: "bounds",
    boundsKind: "document",
    bounds: { x: 412, y: 1240, width: 93, height: 38 }
  }
}
```

When document-space layers are available, the State View uses `documentWidth`
and `documentHeight` for the full visual canvas. It places the viewport
screenshot at `{ x: scrollX, y: scrollY, width: viewportWidth, height:
viewportHeight }`, shifts screenshot BBoxes into that document canvas, and draws
direct-rendered boxes from document bounds for known elements outside the
screenshot. Both screenshot BBoxes and document-space boxes should point to the
same `statePath`, such as `web.elements.deposit`, so selection bridges to the
same Evidence/Facts row.
The uploaded bytes are stored in the importing repository's FluxIQ state root,
under the Automation Studio project. When the upload is authenticated with a
paired client-gateway token for an active recording, the bytes are stored under
`.fluxiq/artifacts/automation-studio/projects/<projectId>/recordings/sessions/<recordingId>/objects/`.
Objects that are not owned by a recording are stored under
`.fluxiq/artifacts/automation-studio/projects/<projectId>/objects/shared/`.
Recordings and snapshots keep only the digest reference; the project object
index maps that digest to the current storage path.
When a recording is deleted, FluxIQ prunes project digest objects that no
remaining project recording or derived artifact still references. This removes
screenshots from the deleted recording and cleans up older orphaned project
objects on the next recording deletion. During pruning, FluxIQ also organizes
older indexed flat objects into recording-owned folders when one live recording
owns the digest, or into `objects/shared/` when the digest is shared or
project-level. Reused screenshots or other shared objects are kept until their
last live reference is removed. FluxIQ also removes the deleted recording's
session directory after moving any still-live shared digest out of it, and it
cleans recording-owned pipeline artifacts from both recording-scoped and legacy
shared JSON locations. Importers should still pass `recordingId` on screenshot
uploads because that gives FluxIQ precise ownership before this deletion sweep
runs. Each recording deletion also sweeps old physical recording session folders
that no longer correspond to a live recording, so leftovers from earlier delete
behavior are removed on the next delete.

High-frequency screenshots or state snapshots may be sent during recording so
the State View can choose the best visual reconstruction for each node. Core
preserves those raw timeline state entries and object references, including
`client.state_snapshot` observations. When object storage is enabled, Core
stores the full JSON `StateSnapshot` as a recording-owned object and keeps only
a lightweight `payload.stateRef` plus metadata in the raw timeline entry.
`get-recording` hydrates that reference only when a UI or tool opens the full
recording.

Importer recording mappers receive action/domain-event observations as the
primary proposal inputs. State snapshots remain linked context for State View,
timeline inspection, normalization review summaries, and state-before/after
correlation; they are not replayed through mappers as independent top-level
observations. This keeps proposal generation proportional to the number of
recorded actions rather than the screenshot cadence and prevents one user click
from becoming many duplicate evidence candidates.

When a finalized recording belongs to a domain with registered importer
recording mappers, FluxIQ generates reviewer-gated Recording Flow proposals
from those mappers before running the generic normalization/mining/policy
proposal pipeline. The generic evidence pipeline remains available for
recordings without mapper support, but extension/importer recordings should not
pay the mining cost just to reach mapped Flow proposals.
Proposal generation is idempotent by default: if the recording has not changed
since the latest mapper proposal, FluxIQ returns the existing proposal instead
of replaying the mapper over the timeline again. Pass `force: true` only when
the operator explicitly requests regeneration.

```ts
const state = {
  id: "snapshot.checkout.1",
  timestamp: Date.now(),
  namespaces: {
    order: {
      schemaId: "example.checkout",
      schemaVersion: "0.1",
      values: {
        status: {
          type: "string",
          value: "ready",
          observedAt: Date.now(),
          presentation: {
            label: "Order status",
            anchor: {
              type: "bounds",
              bounds: { x: 24, y: 42, width: 180, height: 28 }
            }
          }
        }
      }
    }
  },
  presentation: {
    defaultFrameId: "checkout.screen",
    visualFrames: [{
      id: "checkout.screen",
      coordinateSpace: { width: 1280, height: 720, unit: "px" },
      layers: [{
        id: "screen",
        kind: "image",
        contentRef:
          "automation-object://project/example/0000000000000000000000000000000000000000000000000000000000000000",
        bounds: { x: 0, y: 0, width: 1280, height: 720 }
      }]
    }]
  }
};
```

Importer SDK manifests may also declare `stateVisualizers`. A visualizer
definition is declarative metadata: ID, semantic version, label, optional
description, and optional supported namespaces, state kinds, or renderer IDs.
It does not register executable UI code, grant storage access, or authorize
runtime capabilities. The first State View implementation uses these
declarations to describe what an importer can supply, while actual rendering
comes from `StateSnapshot.presentation.visualFrames` plus FluxIQ's generic
fallback views.

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

Proposal generation treats state evidence as a separate layer from action
mapping:

- state present before an executable output action can become node
  `eligibility`;
- state that appears, disappears, or changes after that action can become
  `successConditions`;
- proposal nodes keep references to the action observation, mined claim, and
  underlying state-action correlation so reviewers can trace why a condition
  exists;
- action-role inputs from recording mappers are never reclassified as policy
  state. They remain raw action evidence, while importer reducers and
  state-role observations supply the state evidence.

FluxIQ stores the observation and the node's use of that observation as
separate concepts. A state fact reference names the snapshot namespace/path,
time, and source evidence for what was observed. A node evidence binding names
how one node uses that fact: eligibility, negative eligibility, readiness,
expectation, failure, context, invariant, or ignored evidence. The same state
fact can therefore be eligibility for one node and an expected effect for
another without duplicating or rewriting the original observation.

State inspection can show observed, learned, or runtime sources. Importers
should keep observed recording snapshots literal and timestamped. FluxIQ may
derive learned sources by aggregating multiple recordings for one node, and
runtime sources by reading current execution/client state. Importer reducers do
not need to synthesize learned state themselves.

Runtime debugging compares expected node state with actual runtime state in
the State View's actual-output phase. Importers can provide an explicit
`NodeStateRuntimeComparison` artifact when their runtime has already scored a
node outcome, or they can simply expose current runtime facts with stable
namespace/path IDs and anchors. FluxIQ can derive a basic comparison from
`expectation` and `invariant` evidence bindings: matched expectations render
green, mismatches render red, and unbound runtime facts render gray as
irrelevant context. This comparison is explanatory state, not Flow graph
editing state.

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
UI exposes generated proposals and reconstructed State View entry points, but
FluxIQ stores the underlying evidence as:

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
