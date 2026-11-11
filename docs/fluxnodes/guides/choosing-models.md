# Choosing models

A FluxNode makes model calls in three roles.

| Role | What it does | Read by |
| --- | --- | --- |
| `explore` | Works the task out live on the site, and authors the Flow. | The `explorer.*`, `domain.*` and `core.*` sections. |
| `judge` | Reads the result against what was asked. | The `judge.*` sections and your criteria. |
| `repair` | Fixes a Flow step that broke. | `core.in_run_repair`. |

A replay makes no model call at all. Models cost money only when a run explores, repairs or
judges.

## One model for the whole run

```ts
defineFluxNode({ /* ... */ options: { model: "claude-sonnet-5-5" } });

await fluxiq.run(node, inputs, { overrides: { model: "claude-haiku-5-5" } });
```

`model` is a model id: 1 to 128 of letters, digits, `.`, `_`, `:`, `/` and `-`, starting with a
letter or digit. A per-run value wins over the declared one. With none, the engine uses its
default.

## A model per role

```ts
overrides: {
  models: {
    explore: "claude-sonnet-5-5", // the hard part: worth a stronger model
    judge: "claude-haiku-5-5",    // a short, structured read: a cheaper one is usually enough
    repair: "claude-sonnet-5-5"
  }
}
```

Each role is optional. A role you leave out uses `options.model`, or the engine's default. A
run's `models` merge with the declared ones leaf by leaf.

Each model call goes to its role's model:

- `explore` serves the reading of your goal, every decision while the run works the task out,
  and the drafting of the Flow.
- `judge` serves every call that reads the result against what was asked.
- `repair` serves the calls that diagnose and fix a Flow step that broke (`core.in_run_repair`).
  When a saved Flow breaks part way through a FluxNode run, the run works on to its result with
  its own decisions, and those are `explore` calls today.

Every model a run names is checked when the run starts. An id the engine cannot use ends the run
the same way an unknown `options.model` does, before any call is made. A role never falls back
to another model.

**One budget.** `budgetUsd` is the run's only purse, whatever models it uses. Each call is held
and charged at the price of the model that served it, so a judge on a dearer model costs what that
model costs. The engine keeps back enough of the purse to judge the result, priced at the judge's
model.

## Cost levers

- The model choice is the main cost lever. Do not try to save money by limiting a call's
  output. The budget is the limit, and it ends a run with its best partial result and a resume
  handle.
- `budgetUsd` is the whole purse for a run. See [options](../reference/options.md#budgetusd).
- Explore once, and replay at no cost. The first run is the expensive one. See the
  [README](../README.md#the-learned-flow).
- A run that spends nothing on a replay can still pay for a judge when `judge` is `always`, or
  when criteria changed. See [judging results](judging-results.md).
