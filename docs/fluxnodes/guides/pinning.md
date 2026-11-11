# Pinning a Flow

A FluxNode learns its Flow on the first run and keeps improving it. Each repair is saved, and
the next run replays the repaired Flow. That is what you want while you build.

In production you may want to know exactly what runs. Pin the Flow:

```bash
npx fluxiq pin market.cheapest-listings
```

`fluxiq pin` pins the learned Flow and writes it to `fluxiq/pinned/<name>.flow.json` in your
project. Review the file and commit it. From then on:

- Every run replays exactly the pinned version, even when a newer one exists.
- A run still works on to its result. If the pinned Flow breaks on the site, the run repairs it,
  or explores, as it always does. Pinning never makes a run fail.
- What the run changed is not saved over the pinned Flow. It waits as a **proposal** for you to
  review.

## When a run would change a pinned Flow

The run's result says so in `pinned.held`:

```json
"pinned": {
  "flowVersion": 1,
  "stepsDigest": "4f1c…",
  "held": {
    "code": "fluxnode.pinned_change_held",
    "message": "This FluxNode is pinned, so the Flow this run changed was not saved over the pinned one (version 1). It waits as proposal proposal.86ff59f58b3d0a8c: review it with an export and pin it to adopt it.",
    "proposal": {
      "proposalId": "proposal.86ff59f58b3d0a8c",
      "flowId": "flow.6a85…",
      "stepsDigest": "86ff…",
      "runId": "fnr-…",
      "path": "explored",
      "proposedAt": 1794369219360
    }
  }
}
```

The event stream tells it first, as a `step` event with `stepId: "fluxnode.pinned_change_held"`
and `state: "skipped"`. Its `flowId` is the Flow the run worked in.

Every pinned run has `pinned` on its result: the version it replayed (`flowVersion`) and that
version's identity (`stepsDigest`, the digest of its steps). `held` is there only when the run
changed something. The run's `status`, `outputs` and `path` are the same as they would be
unpinned.

## Reviewing and adopting a proposal

An export without `pin` shows what is pinned and every proposal waiting:

```bash
curl -s -X POST http://127.0.0.1:3000/api/fluxnode/v1/fluxnodes/market.cheapest-listings/export \
  -H "Content-Type: application/json" -H "FluxIQ-Client: curl" -d '{}'
```

- `stepsDigest`, `flowVersion` and `flow.saved` are the pinned version and its steps.
- `proposals` lists each proposal's identity, oldest first.
- `flow.proposals` holds each proposal's steps, by its `proposalId`.

To adopt one, pin again. `fluxiq pin <name>` adopts the newest proposal, and
`fluxiq pin <name> --proposal <id>` adopts the one you name. Over HTTP:

```json
{ "pin": true, "proposal": "proposal.86ff59f58b3d0a8c" }
```

Adopting a proposal makes it the pinned version, with the next version number, and clears every
proposal waiting. The file `fluxiq pin` writes then holds the new steps, so your commit's diff is
the review. With no proposal waiting, pinning again keeps the version that is pinned.

A `proposal` that does not wait, or a `proposal` without `pin: true`, is refused with
`invalid_request`. The issue codes are `export_flow.unknown_proposal` and
`export_flow.proposal_without_pin`.

## What is kept, and where

The pin lives with the FluxNode's Flow in the engine, so it survives a restart. The engine keeps
the newest 20 proposals for each pinned FluxNode. A proposal of the same steps as one already
waiting replaces it.

A pinned FluxNode's runs work in a Flow of their own beside the pinned one, named
`<name> (proposals)`. Nothing they do is written to the pinned Flow.

`mode: "explore"` on a pinned FluxNode starts fresh, as it does unpinned, and changes nothing. Its
result carries `pinned` with no `held`.

## Things to know

- Pinning before anything was learned pins nothing. Each run then explores, and what it finds is
  held as a proposal. Run the FluxNode first, then pin.
- A run that was already going when you pinned is held too. What it changed becomes a proposal.
- A proposal costs model calls each time it is found again. While the pinned Flow keeps breaking,
  each run repairs it again. Review and adopt the proposal, or fix the site, to stop paying for
  the same repair.
- A proposal may keep the step that broke and add its fix after it. Read its steps in the export
  before you adopt it.
- The exported file holds the Flow's steps as the engine saved them. Read it before you commit it,
  as you would any file that came from a run on a real site.
