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

The importer should expose enough factual state for the framework to compare:

- state before an action;
- state after an action;
- values that appeared, disappeared, or changed;
- stable text/IDs/selectors that identify action targets;
- status/count/visibility/enabled values that show effects or readiness.

## Storage

Pipeline artifacts are recording-owned. For a recording pipeline, FluxIQ stores:

```text
pipeline/sessions/{recordingId}/artifacts/evidence/
  facts/{factId}.json
  observations/{observationId}.json
  correlations/{correlationId}.json
  claims/{claimId}.json
```

Aggregate project indexes live under:

```text
pipeline/evidence/
  facts/
  observations/
  correlations/
  claims/
```

Deleting a recording removes its recording-owned pipeline and linked aggregate
pipeline artifacts.

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
