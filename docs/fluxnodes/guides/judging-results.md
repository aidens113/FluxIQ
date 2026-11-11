# Judging results

A run is `achieved` only when its outputs pass, in this order:

1. **The type.** Your `outputs` schema. It costs nothing. Outputs that do not fit are a "no"
   that names where.
2. **Your check.** The `check` function, in your process. Returns `true`, or a reason.
3. **The judge.** A model that reads the result against what was asked, only as configured.

A "no" from the type or the check is not the end. The run reads the reason and goes round
again. A run ends only with its result, or with its budget gone, or when stopped.

## Check

```ts
const node = defineFluxNode({
  /* ... */
  outputs: z.object({ price: z.number(), currency: z.string() }),
  check: ({ outputs, inputs }) => (outputs.price > 0 ? true : `The price for ${inputs.sku} was ${outputs.price}.`)
});
```

A string is a reason, and it goes back into the run. Make it specific. "wrong" teaches the run
nothing. "Two listings share a title" tells it what to fix. See [spec](../reference/spec.md#the-check).

## Judge modes

`options.judge` decides when the judge runs.

| Mode | The judge runs | Use it when |
| --- | --- | --- |
| `auto` (default) | Only when you declared no `check`. With a declared `outputs` type and no check, the engine uses `always`, so the type is checked, then the judge. | You want a check to be enough when you wrote one. |
| `always` | After the type and your check. | The check is cheap and the judge adds meaning, such as "is this the right product". |
| `off` | Never. | You trust the type and check. With neither, the result is `achieved` but its verdict is `unverified`. |

```ts
options: { judge: "always" }
```

## The verdict

Every result has a `verdict`.

| Label | `by` | Meaning |
| --- | --- | --- |
| `confirmed` | `type`, `check` or `judge` | What settled it. With a check declared, `check`. With no check, `type`. |
| `refuted` | same | A run that ended before anything passed, after a "no". It says why in `reason`. |
| `unverified` | none | Nothing settled it. |

An `achieved` run is never `refuted`.

## Judge criteria

Criteria are extra things the judge must hold the result to, in your words.

```ts
overrides: {
  judgeCriteria: [
    "Every listing has a price.",
    "No listing is a sponsored result."
  ]
}
```

At most 20, each 1 to 500 characters. They are added to the judge's question. Set them on the
declaration, or for one run. A run's list **replaces** the declared list. `[]` clears it.

```ts
await fluxiq.run(node, inputs, { overrides: { judgeCriteria: [] } }); // no extra criteria this run
```

Criteria need a judge to read them. With `judge: "off"` they have no effect, and with `auto`
and a check declared, the judge does not run unless something changed (see below). Use
`judge: "always"` when you want them applied on every run.

You can also change the judge's own wording with the open sections `judge.verification` and
`judge.question`. The reply format, `judge.fields` and `judge.order`, is locked. See
[customizing prompts](customizing-prompts.md).

## Re-judging when criteria change

An exact replay of a proven Flow is normally accepted without a judge, since a judge already
confirmed it. That would leave new criteria unread.

So the engine records a digest of what the judge reads (the `judge.*` prompt sections and the
criteria) when a run is confirmed by the judge. When a later run's digest differs from the
recorded one, that run is judged again, even if the Flow would replay unjudged. It does this
unless `judge` is `off`.

So you can add a criterion, run again, and know it was applied. Changing anything the judge
does not read, such as a retry wait, does not trigger a re-judge.

The engine holds this record in memory, so a restart forgets it.

## Reading the outcome

```ts
const run = await fluxiq.run(node, inputs);
run.verdict;  // { label: "confirmed", by: "judge" }
run.cost;     // { calls, tokens, usd }
run.path;     // "replayed", "repaired" or "explored"
```

A replay that passes your check makes no model call. When a judge runs, you see its calls in
`cost`.
