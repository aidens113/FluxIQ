# HTTP API

The FluxNode API is plain JSON over HTTP, with server-sent events for a run's progress.
`fluxiq dev` serves it on your machine, and a hosted engine serves the same API. The SDK is a
thin client of it, so anything the SDK does you can do with any HTTP client.

Base path: `/api/fluxnode/v1`. The version is in the path. A breaking change would be a new
version beside this one.

## Calling a local engine

An engine in open mode (no key) accepts a call only when all of these hold. Each one keeps a
web page or another machine from driving your browser.

- The call comes from this computer.
- The `Host` header is `localhost`, `127.0.0.1` or `[::1]`, with or without a port.
- There is no `Origin` header, and no cross-site `Sec-Fetch-Site`.
- A `FluxIQ-Client` header names the calling program. The SDK sends `sdk`. With curl, send any
  name, such as `curl`.
- A `POST` sends `Content-Type: application/json`.

No `Access-Control-*` header is ever sent, so a browser page cannot call it.

A request body is at most 1 MB.

## Endpoints

| Method and path | Does |
| --- | --- |
| `POST /specs` | Register a FluxNode spec, or a data pipeline. |
| `POST /runs` | Start a run. |
| `GET /runs` | List runs, newest first. |
| `GET /runs/{runId}` | A run's state, and its result once it has ended. |
| `GET /runs/{runId}/events` | The run's events as server-sent events. |
| `POST /runs/{runId}/answers` | Answer an event that waits for your program. |
| `POST /runs/{runId}/stop` | Stop a run. |
| `POST /fluxnodes/{name}/export` | Export a FluxNode's learned Flow, and optionally pin it. |

A success answers `200` with a JSON body. A wrong method answers `405` with an `Allow`
header. An unknown path answers `404` with code `invalid_request`. A failure answers with
the [error body](#errors).

### POST /specs

Register a spec without running it. Give exactly one of `spec` and `pipeline`.

```json
{ "spec": { "name": "shop.price", "runtime": "web", "goal": "Read the price of {sku}.",
            "start": "https://shop.example/", "inputs": { "type": "object", "properties": { "sku": { "type": "string" } }, "required": ["sku"] },
            "scope": { "sites": ["shop.example"], "acts": [] } } }
```

Response:

```json
{ "name": "shop.price", "specHash": "9f2c...64 hex", "flowPath": "nodes/shop/price", "created": true }
```

`created` is false when this name and hash were already registered. `previousSpecHash` is
present when the name's latest hash was different, which means a new learned Flow starts.

### POST /runs

Start a run. Give exactly one of `spec`, `name`, `resumeHandle` and `pipeline`.

| Field | Meaning |
| --- | --- |
| `spec` | The FluxNode itself. Registered on the way if it is new. |
| `name` | A registered FluxNode, at its latest spec, or at `specHash`. |
| `specHash` | Picks a version of a registered `name`. Needs `name`. 64 lowercase hex characters. |
| `resumeHandle` | Continues a `budget_out` or `waiting_for_person` run. 16 to 512 of `A-Z a-z 0-9 . _ ~ -`. |
| `pipeline` | A data pipeline. Registered on the way if it is new. |
| `inputs` | The run's inputs, a JSON object. Checked against the spec. Not allowed with `resumeHandle`. |
| `options` | [Options](options.md) for this run. Not allowed with `resumeHandle`. |
| `overrides` | [Overrides](overrides.md) for this run. Not allowed with `resumeHandle`. |
| `correlationId` | Ties separate runs together. 1 to 128 of `A-Z a-z 0-9 . _ : -`. |
| `idempotencyKey` | Same key and same request returns the same run. Same characters. |

The answer comes back at once, usually with `state: "running"`. The run goes on after the call.

```json
{
  "runId": "fnr-5b0c...",
  "name": "shop.price",
  "specHash": "9f2c...",
  "state": "running",
  "startedAt": 1762800000000,
  "eventsPath": "/api/fluxnode/v1/runs/fnr-5b0c.../events",
  "cost": { "calls": 0, "tokens": 0, "usd": 0 }
}
```

A repeated `idempotencyKey` with the same request answers the run it started, which may have
ended. With a different request it answers `idempotency_conflict`.

A run held by an engine lives in memory. It outlives the call that started it, not the engine
process.

### GET /runs

Query parameters, all optional.

| Parameter | Meaning |
| --- | --- |
| `name` | Only this FluxNode. |
| `state` | `running`, `achieved`, `budget_out`, `stopped` or `waiting_for_person`. |
| `correlationId` | Only runs with this id. |
| `limit` | 1 to 200. Default 50. |
| `cursor` | The `nextCursor` of the last page. |

```json
{ "runs": [ { "runId": "fnr-5b0c...", "name": "shop.price", "state": "achieved", "startedAt": 1762800000000,
              "endedAt": 1762800004200, "path": "replayed", "cost": { "calls": 0, "tokens": 0, "usd": 0 } } ],
  "nextCursor": "abc123" }
```

### GET /runs/{runId}

The run's state. Once it has ended, `result` is present, and `state` equals `result.status`.

| Field | Meaning |
| --- | --- |
| `runId`, `name`, `specHash` | The run and the FluxNode it ran. A pipeline has no spec hash. |
| `state` | `running`, or one of the four endings. |
| `startedAt` | Epoch milliseconds. |
| `eventsPath` | Where the events stream from. |
| `cost` | What it has spent so far. |
| `waitingEventIds` | Events that wait for your answer. |
| `correlationId` | Echoed. |
| `result` | Present exactly when the run has ended. |

### The result

| Field | Meaning |
| --- | --- |
| `runId`, `name`, `specHash` | As above. |
| `flowId`, `flowPath` | The Flow it used or began. |
| `status` | `achieved`, `budget_out`, `stopped` or `waiting_for_person`. |
| `outputs` | What it produced. Typed by your `outputs` when declared. |
| `outputsType` | The type Core inferred, when you declared none. |
| `verdict` | `{ label, by?, reason? }`. `label` is `confirmed`, `refuted` or `unverified`. `by` is `type`, `check` or `judge`, present exactly when the label is `confirmed` or `refuted`. A `refuted` verdict has a `reason`. An `achieved` run is never `refuted`. |
| `path` | `replayed`, `repaired` or `explored`. |
| `cost` | `{ calls, tokens, usd }`. A replay that passes its check makes no call. |
| `timings` | `{ startedAt, endedAt, durationMs }`. |
| `resumeHandle` | Present for `budget_out` and `waiting_for_person`, and only then. |
| `waitingFor` | What a person must do. Present exactly when the run waits for a person. |
| `lineage` | Where output values came from. At most 1000 entries. |
| `datasets` | Datasets the run stored. At most 64. |
| `correlationId` | Echoed. |
| `overridesDigest` | The digest of the run's overrides. Present only when it had any. |
| `pinned` | Present when the FluxNode is pinned: `flowVersion` and `stepsDigest` of the version replayed, and `held` (`code`, `message`, `proposal`) when the run's change was held as a proposal. |

### GET /runs/{runId}/events

A stream of server-sent events. Each frame:

```
id: 3
event: step
data: {"type":"step","runId":"fnr-5b0c...","seq":3,"at":1762800001000,"flowId":"...","stepId":"...","label":"Open the product page","state":"started"}

```

- `id` is the event's `seq`, which rises by one from 1.
- `event` is the event's `type`.
- A quiet stream sends a keep-alive comment line every 15 seconds.
- The stream closes after the `ended` event.
- To reconnect, send `Last-Event-ID: <seq>`, or add `?after=<seq>`. You get every event after it.

Every event has `runId`, `seq` and `at` (epoch milliseconds).

| Type | Extra fields | Waits for you? |
| --- | --- | --- |
| `step` | `flowId`, `stepId`, `label`, `state` (`started`, `succeeded`, `retrying`, `failed`, `skipped`), `attempt?` | No |
| `person_needed` | `eventId`, `need` (`sign_in`, `human_check`, `confirm`, `other`), `reason`, `waitUntil?` | Yes: `person_answer` |
| `check_needed` | `eventId`, `outputs`, `inputs` | Yes: `check_answer` |
| `transform_needed` | `eventId`, `stepId`, `callback`, `records` (at most 1000) | Yes: `transform_answer` |
| `cost` | `cost`, `budgetUsd` | No |
| `ended` | `result` | No. The last event of every run. |

A step that is `failed` is retried or worked around. The run itself never ends as failed.

If a `person_needed` event is not answered by `waitUntil`, the run ends `waiting_for_person`
with a resume handle. The default wait is 10 minutes. Set `deadlines.personWaitMs` to change it.

### POST /runs/{runId}/answers

Answer an event that waits. The body is one of:

```json
{ "type": "check_answer", "eventId": "fnr-5b0c....e1", "pass": true }
{ "type": "check_answer", "eventId": "fnr-5b0c....e1", "pass": false, "reason": "Two listings share a title." }
{ "type": "person_answer", "eventId": "fnr-5b0c....e2", "outcome": "done" }
{ "type": "transform_answer", "eventId": "fnr-5b0c....e3", "records": [ { "sku": "a-1" } ] }
```

- A failed check must give a `reason`. It goes back into the run as a "no" to fix. A passed check gives none.
- `person_answer` has `outcome` `done` or `declined`, and an optional `note`.
- `transform_answer` has exactly one of `records` and `error`.

Response: `{ "accepted": true }`. The answer must match the event's kind and id
(`answer_mismatch`, `unknown_event`). An event is answered once (`event_already_answered`).
An ended run takes no answers (`run_ended`). A stop or an end settles every open wait with no
answer, so a check nobody answers sends the run round again, or parks it.

The SDK answers `check_needed` and `transform_needed` for you, and `person_needed` when you
pass `onPersonNeeded`.

### POST /runs/{runId}/stop

Body: `{}` or `{ "reason": "..." }` (an empty body is `{}`). The run ends `stopped` with what it
has. The answer waits up to 30 seconds for the run to end, then returns its state. A run that
already ended answers `run_ended`.

### POST /fluxnodes/{name}/export

Body: `{ "specHash": "...", "pin": true, "proposal": "..." }`, all optional. `pin` defaults to
false. `proposal` is valid only with `pin: true` and adopts that waiting proposal. With `pin: true`
and no `proposal`, the newest waiting proposal is adopted. With none waiting, the pinned version is
kept, or on a first pin the learned Flow is pinned.

The answer is the learned Flow as a reviewable document:

| Field | Meaning |
| --- | --- |
| `format` | Always `"fluxiq.fluxnode-flow"`. |
| `formatVersion` | Always `1`. |
| `name`, `specHash` | The FluxNode and spec it serves. |
| `flowId`, `flowPath`, `flowVersion` | The Flow's identity and version. Versions are numbered by the order they were first pinned; a version never pinned shows as the next number. |
| `stepsDigest` | The version's identity: the digest of the steps a replay runs. |
| `proposals` | Changes a pinned FluxNode's runs held, oldest first: `proposalId`, `flowId`, `stepsDigest`, `runId`, `path`, `proposedAt`. Absent when none wait. |
| `pinned` | Whether this version is now pinned. |
| `exportedAt` | Epoch milliseconds. |
| `flow` | The Flow document as it is stored (`flow.artifact`), with `flow.saved` (the steps of this version) and `flow.proposals` (each waiting proposal's steps, by `proposalId`). |

`fluxiq pin <name>` calls this with `pin: true` and writes the answer to
`fluxiq/pinned/<name>.flow.json` (`--proposal <id>` adopts a named proposal). A pinned FluxNode
replays exactly the pinned version. A run's repair or exploration is held as a proposal
(`result.pinned.held`, code `fluxnode.pinned_change_held`) until you pin again. See
[pinning](../guides/pinning.md).

## Starting a run with curl

```bash
curl -s http://127.0.0.1:3000/api/fluxnode/v1/runs \
  -H "Content-Type: application/json" \
  -H "FluxIQ-Client: curl" \
  -d '{ "name": "shop.price", "inputs": { "sku": "A1" }, "options": { "budgetUsd": 0.5 }, "overrides": { "judgeCriteria": ["The price includes the currency."] } }'
```

See [per-run overrides over HTTP](../examples/per-run-overrides-http.md) for a full walk through.

## Errors

Every failure answers with this body and the status below.

```json
{ "error": { "code": "invalid_request", "message": "The request body was not valid.",
             "issues": [ { "path": "/overrides/prompts/core.output_rules", "code": "overrides.section_locked", "message": "..." } ] } }
```

`issues` (at most 200) appears only when it applies. Each issue has a JSON
Pointer `path`, a `code` and a `message`.

| Code | Status |
| --- | --- |
| `invalid_request`, `invalid_spec`, `invalid_inputs` | 400 |
| `unauthenticated` | 401 |
| `forbidden` | 403 |
| `unknown_fluxnode`, `unknown_spec_hash`, `unknown_run`, `unknown_event` | 404 |
| `event_already_answered`, `answer_mismatch`, `run_ended`, `idempotency_conflict` | 409 |
| `internal` | 500 |

Each code is explained in [errors](errors.md).

A body whose `spec` fails validation answers `invalid_spec` with `issues`, each under `/spec`. Any
other body that fails validation answers `invalid_request` with `issues`. A body that parses but
whose inputs do not fit the FluxNode answers `invalid_inputs`.

## The paths in code

```ts
import { FLUXNODE_API_PATHS, fluxNodeApiPath } from "@fluxiq/contracts/fluxnode";

FLUXNODE_API_PATHS.runs; // "/api/fluxnode/v1/runs"
fluxNodeApiPath("run", { runId: "fnr-5b0c" }); // "/api/fluxnode/v1/runs/fnr-5b0c"
```
