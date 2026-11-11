# FluxNodes

A FluxNode is a task you declare in code and FluxIQ does for you. You say what you
want, where to start, and what the answer looks like. FluxIQ works out how.

```ts
import { FluxIQ, defineFluxNode, z } from "@fluxiq/sdk";

const cheapestListings = defineFluxNode({
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest listings for {query}.",
  start: "https://market.example/",
  inputs: z.object({ query: z.string(), count: z.number().int().max(10) }),
  outputs: z.object({ listings: z.array(z.object({ title: z.string(), price: z.number() })) }),
  scope: { sites: ["market.example"], acts: ["read"] },
  check: ({ outputs, inputs }) => outputs.listings.length === inputs.count || "wrong number of listings"
});

const fluxiq = await FluxIQ.connect();
const run = await fluxiq.run(cheapestListings, { query: "lens hood", count: 3 });
if (run.status === "achieved") console.log(run.outputs.listings);
```

## The learned Flow

The first run of a FluxNode explores. A model works the task out on the real site, step by
step, and FluxIQ saves what worked as a **Flow**.

Later runs replay that Flow. A replay that passes your check makes no model call and costs
$0. If the site changes and a step breaks, FluxIQ repairs the Flow. If repair cannot fix it,
it explores again. You never write selectors, and you never maintain a script.

The Flow is filed under the FluxNode's name and spec hash. Change the goal, the types, the
scope, the runtime or the start, and you get a new task beside the old one. Change an option,
the check or an override, and the learned Flow is kept. See [spec](reference/spec.md).

## How a run ends

A run never "fails". It ends one of four ways.

| Status | Meaning |
| --- | --- |
| `achieved` | The outputs passed the type, then your check, then the judge as configured. |
| `budget_out` | The budget is gone. You get the best partial result and a resume handle. |
| `stopped` | Your program aborted it, or a person pressed Stop. |
| `waiting_for_person` | Only a person can go on (a sign-in, a robot check). You get a resume handle. |

## Five-minute quickstart

You need Node 22 or newer.

```bash
pnpm add @fluxiq/sdk
pnpm add -D fluxiq
npx fluxiq init     # makes ~/.fluxiq and an owner key; writes nothing into your project
npx fluxiq dev      # starts the local engine on http://127.0.0.1:3000
```

Give the engine a model key before the first run. The first run of a FluxNode explores, and
exploring calls a model.

- **Where the key lives.** The engine reads no model key from an environment variable or a file, and
  `fluxiq dev` has no flag for one. A model key is an entry of kind `llm` in the engine's Secret
  Keys, stored in its data directory, for the provider Anthropic (Claude) or DeepSeek. Add it in the
  FluxIQ web panel's Secret Keys settings, against the same data directory `fluxiq dev` serves. The
  key is sealed, and opened for a run only while it is unlocked.
- **Which model.** `FLUXIQ_LLM_DEFAULT_MODEL` names the default model, for either provider, in the
  environment of `fluxiq dev`. It is a model name, never a key. Without it the engine uses its own
  default model. A FluxNode can name another with its `model` option.
- **If it is missing.** With no enabled model key the engine has no model to call and says so: "No
  model is available for this. Add or unlock a model key in FluxIQ's settings, then ask again."
  With a key it cannot open (locked), the run ends `waiting_for_person` and its result says "The
  model key cannot be opened here, and a person needs to unlock it." Unlock the key, then `resume`
  with the handle. A run that replays a learned Flow makes no model call and needs no key.

Never put a key value in your program, your FluxNode, or this repository.

Save the FluxNode above as `node.ts` with this at the end, then run it with your usual
TypeScript runner.

```ts
const fluxiq = await FluxIQ.connect();
const run = await fluxiq.run(cheapestListings, { query: "lens hood", count: 3 });
console.log(run.status, run.path, run.cost);
if (run.status === "achieved") console.log(run.outputs.listings);
```

The first run prints `path: "explored"` and a cost above zero. Run it again. It prints
`path: "replayed"` and `calls: 0`.

The command line works on what you have run:

```bash
npx fluxiq runs --name market.cheapest-listings   # list runs, newest first
npx fluxiq inspect <runId> --events                # one run, with its events
npx fluxiq pin market.cheapest-listings            # write the learned Flow to fluxiq/pinned/ for review
```

`fluxiq learn ./node.mjs --samples samples.json` runs a FluxNode over sample inputs before
you deploy it, so the first real run replays. `learn` loads a `.js` or `.mjs` module.

## Customize everything

Every part of how a FluxNode works is yours to change, down to the prompts Core sends the
model. Core keeps a short list of safety words and gates out of reach.

- Retries, judge, budget, model, mode, timeout and humanness: [options](reference/options.md).
- Prompts, judge criteria, tool descriptions, models, deadlines, waits and pace:
  [overrides](reference/overrides.md).
- What can never be changed: [safety](guides/safety.md).

## Pages

Reference

- [Spec](reference/spec.md): every field of a FluxNode declaration.
- [Options](reference/options.md): retries, judge, budget, model, mode, timeout, humanness.
- [Overrides](reference/overrides.md): prompt sections, tools, criteria, models, deadlines, waits, pace.
- [HTTP API](reference/http-api.md): every endpoint, request, response and the event stream.
- [Errors](reference/errors.md): every named code, its cause and its fix.
- [Limits](reference/limits.md): every bound in one table.

Guides

- [Customizing prompts](guides/customizing-prompts.md)
- [Retries and deadlines](guides/retries-and-deadlines.md)
- [Judging results](guides/judging-results.md)
- [Choosing models](guides/choosing-models.md)
- [Pinning a Flow](guides/pinning.md)
- [Safety](guides/safety.md)

Examples

- [A scraping node with a check](examples/scraping-with-check.md)
- [A node with custom prompts and criteria](examples/custom-prompts-and-criteria.md)
- [A pipeline](examples/pipeline.md)
- [Per-run overrides over HTTP](examples/per-run-overrides-http.md)

## Coming soon

- Ready-made person-needed handlers (notify a person, wait for the answer).
