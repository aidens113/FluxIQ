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
task proposals
  policy nodes linked back to supporting claims
```

Finalized recordings are processed automatically by the framework when the
recording has a project owner. Automation Studio normalizes the recording,
mines evidence, and creates a task proposal unless a current proposal already
exists. Importers should focus on factual event/state quality; they do not need
to call each mining stage directly in normal operation.

Recordings that are meant to contribute to the same task should use the same
`taskId` when the recording session is created. FluxIQ carries that task ID
through normalization, mining, proposal generation, and direct application.
When multiple approved proposals target the same task, the framework reuses
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
the task identity. Proposal edits are cached by FluxIQ as workspace state until
the user explicitly applies the proposal to an existing task or saves it as a
new task. Only that explicit action writes or updates the project task and its
task-owned flow on the server side.

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
  proposal/proposal.json
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

Do not mark these as critical. Let FluxIQ infer importance by seeing which
values consistently lead to or follow recorded actions.
