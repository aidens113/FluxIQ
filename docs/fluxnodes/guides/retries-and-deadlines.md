# Retries and deadlines

Sites are slow, pages move and networks drop. FluxIQ retries on its own, and you control how
much.

## Retries

Every step is retried automatically: the first attempt plus 3 retries, on every path
(exploring, trial runs and replay). A step waits for its target to be ready before each
attempt. You can raise the count and never lower it.

```ts
const node = defineFluxNode({ /* ... */ options: { retries: 6 } }); // 7 attempts per step

await fluxiq.run(node, inputs, { overrides: { retries: 8 } });     // for one run
```

`retries` is between 3 and 100. See [options](../reference/options.md#retries).

**A stale target is found again.** Targets change. When a step's target came from an earlier
step (a row in a list, a search result), the second failed retry re-runs that earlier step,
finds the same item again by what it is rather than where it was, and spends the remaining
retries on the fresh target. An item that is truly gone is reported as gone. A lasting act
whose earlier attempt may have landed is never repeated.

## Waits between retries

`retryWaits` sets how long a step waits between attempts.

```ts
overrides: {
  retryWaits: {
    backoffMs: [500, 1500, 3000, 6000], // waits between attempts, in order
    perNodeMs: 120_000,                  // the most all waits at one step may add up to
    perRunMs: 600_000                    // the most all waits in one run may add up to
  }
}
```

Core's defaults are `[250, 1000, 2000]`, 60 seconds a step and 5 minutes a run. When you raise
`retries` without setting `perNodeMs` and `perRunMs`, those two allowances scale with the extra
attempts, so a run that asks for more retries is not cut short by an allowance sized for three.

Once a run has spent its whole waiting allowance, it stops absorbing faults by waiting. The run
still goes on and uses its other ways to recover. Waiting is bounded so that a run that fails
everywhere does not grind.

## Deadlines

```ts
overrides: {
  deadlines: {
    llmCallMs: 30_000,    // one model call: 1 to 45 seconds, Core's default 20
    judgeMs: 120_000,     // the judge: 30 seconds to 30 minutes
    personWaitMs: 300_000 // wait for a person-needed answer: 1 second to 7 days, Core's default 10 minutes
  }
}
```

- `llmCallMs` bounds one model call. The engine refuses a value above 45 seconds.
- `judgeMs` bounds the judge. If you leave it out, Core derives it from the model-call deadline:
  the larger of 2 minutes and every call the judge may make at that deadline plus 30 seconds.
- `personWaitMs` is how long a `person_needed` event waits for your answer. A value you set
  also outlasts Core's own default expiry on an ask; a robot check still pauses for a person. After that the run
  ends `waiting_for_person` with a resume handle. See [safety](safety.md).

## When the model service is silent

If the model service does not answer, Core waits, and asks again. The wait doubles each time,
from a base to a cap.

```ts
overrides: { deadlines: { modelSilence: { baseMs: 2_000, capMs: 30_000 } } }
```

Core's defaults are 5 seconds, doubling, capped at 60 seconds. This changes only the delay
between asks. Waiting costs nothing and how many times Core asks is never limited. A run ends
with its result or with its budget gone, not because a service was down.

## Pace

`pace.minStepGapMs` sets the least gap between two steps. Use it to be gentle with a site that
rate-limits.

```ts
overrides: { pace: { minStepGapMs: 400 } }
```

A rate-limit popup is not an error to hide. A good Flow learns to wait, dismiss it and go back.
Slowing the pace helps a run avoid it.

## A timeout for the whole run

`options.timeoutMs` is a clock on the run, up to 7 days. When it runs out the run is stopped
and ends `stopped` with what it has.

```ts
await fluxiq.run(node, inputs, { overrides: { timeoutMs: 900_000 } });
```

To stop a run yourself, pass an `AbortSignal`, or call `fluxiq.stop(runId)`.

## The budget is the other limit

A run ends with its result or with its budget gone. `budgetUsd` is the purse. See
[options](../reference/options.md#budgetusd).
