# Options

Options say how a run is budgeted and judged. Every option is optional. Set them on the
FluxNode, and override them for one run.

```ts
const node = defineFluxNode({
  /* ... */
  options: { retries: 5, judge: "auto", budgetUsd: 2, mode: "auto", timeoutMs: 600_000 }
});

// One run, different settings:
await fluxiq.run(node, inputs, { overrides: { budgetUsd: 0.25, humanness: 40 } });
```

## The options

| Option | Type | Default | Bounds | What it does |
| --- | --- | --- | --- | --- |
| `retries` | integer | `3` | 3 to 100 | Retries per step. The first attempt plus this many. Three is the floor. You may raise it, never lower it. |
| `judge` | `"auto"` \| `"always"` \| `"off"` | `"auto"` | | When the judge runs, after the type and your check. |
| `budgetUsd` | number | `5` | 0 to 100000 | The run's whole allowance in dollars. `0` means replay only. |
| `model` | string | the engine's default | 1 to 128 of letters, digits, `.`, `_`, `:`, `/`, `-`; starts with a letter or digit | The model id for the run, such as `"claude-haiku-5-5"`. |
| `mode` | `"auto"` \| `"explore"` | `"auto"` | | How the run starts. |
| `timeoutMs` | integer | none | 1 to 604800000 (7 days) | The longest the run may take. |
| `humanness` | integer | `0` | 0 to 100 | How human the run's input looks. |

### retries

A step is retried automatically on every path: exploring, trial runs and replay. The default
is the first attempt plus 3 retries, which is 4 attempts. `retries: 6` gives 7. A value below
3 is refused with the message "retries is at least 3: the first attempt plus 3 is the floor
on every step." See [retries and deadlines](../guides/retries-and-deadlines.md).

### judge

- `auto`: the judge runs only when you declared no `check`. With a declared `outputs` type and no
  check, the engine asks for `always`, so the type is checked, then the judge.
- `always`: the judge runs after the type and your check.
- `off`: no judge. With no check and no type, the result is `achieved` and its verdict is
  `unverified`.

See [judging results](../guides/judging-results.md).

### budgetUsd

One purse per run, in billed dollars. A run that spends it ends `budget_out` with the best
partial result and a resume handle. Model output is never capped to save money.

`budgetUsd: 0` is replay only: it replays the learned Flow and spends nothing. If replay
cannot finish, the run ends `budget_out` rather than exploring.

### model

Names the model for the run. For a model per role (explore, judge, repair), see
[choosing models](../guides/choosing-models.md).

### mode

- `auto`: replay the learned Flow, repair it if it breaks, explore on if repair cannot fix it.
- `explore`: start fresh, and keep the old learned Flow as it was. An `auto` run afterwards
  still uses the old one. Use it to compare, or to re-learn on purpose.

### timeoutMs

A clock on the whole run. When it runs out the run is stopped and ends `stopped` with what
it has.

### humanness

An integer from 0 to 100. `0` is today's path exactly: no added waits, centre-first click
points, synchronous typing. It is the default because speed is the priority. Higher levels
randomise timing, click points, typing pace, scroll dwell and inert misclicks from a seeded
generator, so a site sees input that looks more like a person's. A value outside 0 to 100,
or a fraction, is refused by the contract.

## Layering

Each setting is resolved in this order, and the later one wins.

1. Core's default (the Default column above).
2. The FluxNode's `options`.
3. The run's own, from `overrides` in the SDK (or `options` in the request body).

`retries` is then raised to at least 3. `model`, `timeoutMs` and `humanness` stay unset
when nothing sets them.

A resumed run keeps its first options. Passing `options` with a `resumeHandle` is refused
(`run_request.options_on_resume`).

In the SDK, per-run options and per-run [overrides](overrides.md) are written in one flat
object, `RunOptions.overrides`. The SDK sends the option keys as `options` and the rest as
`overrides`. Over HTTP you send them in two fields. See the [HTTP API](http-api.md).
