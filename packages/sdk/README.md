# @fluxiq/sdk

A thin TypeScript client of the FluxNode HTTP API. Declare a FluxNode in code, run it, get typed outputs.

```ts
import { FluxIQ, defineFluxNode, z } from "@fluxiq/sdk";

const cheapestListings = defineFluxNode({
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest listings for {query} that ship to {country}.",
  start: "https://market.example/",
  inputs: z.object({ query: z.string(), country: z.string(), count: z.number().int().max(10) }),
  outputs: z.object({ listings: z.array(z.object({ title: z.string(), price: z.number(), url: z.string().url() })) }),
  scope: { sites: ["market.example"], acts: ["read"] },
  check: ({ outputs, inputs }) => outputs.listings.length === inputs.count || "wrong number of listings"
});

const fluxiq = await FluxIQ.connect(); // finds the local engine and any key itself
const run = await fluxiq.run(cheapestListings, { query: "lens hood", country: "UK", count: 3 });
if (run.status === "achieved") run.outputs.listings; // typed
```

- `inputs` and `outputs` take zod schemas or raw JSON Schema in the contracts' subset. A `pattern` beside a `format` is dropped; a bare `pattern` is an `SdkError` that suggests a format.
- A run ends `achieved`, `budget_out`, `stopped` or `waiting_for_person`. The last two carry a `resumeHandle` for `fluxiq.resume(node, handle)`.
- `check` runs in your process when the engine asks. `onPersonNeeded` answers a person-only moment. `signal` stops the run.
- `fluxiq.stream(node, inputs)` yields every event of a run as it happens.
- `pipeline("name").fromInput("rows").map(node, {...}).sink(...).build()` builds a data pipeline definition.

## Finding the engine and the key

`FluxIQ.connect({ url?, apiKey?, keyFile?, profile? })` walks a credential chain and stops at the first key it is told about. A key that is named and cannot be used is an error; it never falls through.

1. the explicit option;
2. `FLUXIQ_KEY` (PEM, or `fxkey1.<base64url>`), then `FLUXIQ_KEY_FILE`;
3. `FLUXIQ_KEY_PROFILE`;
4. a `profile` in the project's `fluxiq.config.json` (which never holds a key);
5. the `[default]` profile of `~/.fluxiq/credentials`;
6. no key: open mode, which only a local engine accepts.

Private keys live only under `~/.fluxiq/keys/` (`FLUXIQ_CONFIG_DIR` moves the folder). The engine's address defaults to `http://127.0.0.1:3000`; `FLUXIQ_ENDPOINT` or a profile's `endpoint` changes it.

## Data pipelines

`pipeline(name).fromInput("rows")...build()` builds a data pipeline (map a FluxNode over records, filter, transform, join, sort, sink). Run it like a FluxNode:

```ts
const built = pipeline("market.price-report").fromInput("skus").map(lookup, { inputs: { sku: { field: "sku" } } }).outputs(reportRow).build();
const run = await fluxiq.runPipeline<ReportRow>(built, { skus: [{ sku: "a-1" }] });
if (run.status === "achieved") console.log(run.outputs); // the final records, with lineage on `run.lineage`
```

The engine compiles the pipeline to a Flow and registers it on the way (`fluxiq.registerPipeline(built)` registers without running), so the second run replays every mapped call at no model cost. Function transforms and sinks written in your program run here: the engine asks for them over `transform_needed`, and `runPipeline` answers from the built callbacks (`options.transforms` adds to or replaces them). A mapped call that ends budget out, stopped or waiting ends the pipeline the same way; continue it with `fluxiq.resumePipeline(built, run.resumeHandle)`.

## The `fluxiq` command

| Command | Does |
| --- | --- |
| `fluxiq init` | Creates `~/.fluxiq` with an owner Ed25519 key pair (owner-only permissions) and a `[default]` profile. Writes nothing into the project. |
| `fluxiq dev` | Runs the engine's own `fluxiq dev` when the `fluxiq` package is installed; says how to install it otherwise. |
| `fluxiq runs` | Lists runs. |
| `fluxiq inspect <runId> [--events]` | Shows a run's state, result and events. |
| `fluxiq pin <name>` | Pins the learned Flow and writes `fluxiq/pinned/<name>.flow.json` for review. |
| `fluxiq learn <module> --samples <file.json>` | Runs a FluxNode over sample inputs before deployment. The module is `.js` or `.mjs`. |

## License

Source-available under the FluxIQ license included with this package.
