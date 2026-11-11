# A pipeline

A pipeline calls a FluxNode once for each record in a list, then shapes the results. Here it
looks up the price of every SKU in a list and builds a report, sorted cheapest first.

```ts
import { FluxIQ, defineFluxNode, pipeline, z } from "@fluxiq/sdk";

// 1. The FluxNode the pipeline calls, once per SKU.
const lookup = defineFluxNode({
  name: "shop.product-price",
  runtime: "web",
  goal: "Read the current price of the product with SKU {sku}, including its currency.",
  start: "https://shop.example/",
  inputs: z.object({ sku: z.string() }),
  outputs: z.object({ price: z.number().min(0), currency: z.string() }),
  scope: { sites: ["shop.example"], acts: [] }
});

// 2. The shape of each report row.
const reportRow = z.object({ sku: z.string(), price: z.number(), currency: z.string() });
type ReportRow = z.infer<typeof reportRow>;

// 3. The pipeline.
const built = pipeline("shop.price-report", {
  inputs: z.object({ skus: z.array(z.object({ sku: z.string() })) })
})
  .fromInput("skus")                                             // records come from the input list
  .map(lookup, { inputs: { sku: { field: "sku" } }, as: "found", concurrency: 2 })
  .transform({ expression: { object: {
    sku: { field: "sku" },
    price: { field: "found.price" },
    currency: { field: "found.currency" }
  } } })
  .sort([{ field: "price", order: "asc" }])
  .outputs(reportRow)
  .build();

// 4. Run it.
const fluxiq = await FluxIQ.connect();
const run = await fluxiq.runPipeline<ReportRow>(built, { skus: [{ sku: "A1" }, { sku: "B2" }, { sku: "C3" }] });

if (run.status === "achieved") {
  for (const row of run.outputs) console.log(row.sku, row.price, row.currency);
  console.log(run.lineage); // where each output value came from
}
```

## How it runs

- The engine compiles the pipeline into a Flow and registers it on the way.
  `fluxiq.registerPipeline(built)` registers without running.
- Each `map` call is a run of the FluxNode, with the same events, retries and result as any
  other run. The first call to `shop.product-price` explores. The rest replay.
- Run it again and every mapped call replays, so the second run costs nothing in model calls.
- The final records are checked against `outputs`. A record that does not fit is a "no" for
  the run to fix.

## Steps you can add

`filter`, `dedupe`, `join`, `limit`, `aggregate`, `validate` and `sink` are there beside
`map`, `transform` and `sort`. A function transform runs in your process:

```ts
.transform({ fn: async (records) => records.map((record) => ({ ...record, seen: Date.now() })), batchSize: 50 })
```

The engine asks for it over a `transform_needed` event and `runPipeline` answers from the
built callbacks. A sink can write to a dataset, a file, a webhook or a function:

```ts
.sink({ kind: "file", format: "csv", path: "exports/prices.csv" })
```

A file sink writes under the engine's export folder, and never outside it. A webhook must be
`https`, or `http` on this machine, with no credentials in the address.

## Customizing a pipeline's calls

Override a FluxNode the pipeline calls by declaring `overrides` on that FluxNode, as in
[custom prompts and criteria](custom-prompts-and-criteria.md). A mapped call keeps the FluxNode's
declared overrides, and the pipeline run's `options` pass to its calls.

A pipeline run takes no per-run `overrides`: a prompt section or tool belongs to one FluxNode, and
a pipeline calls several. The SDK refuses them before any request, and the engine refuses them
with `run_request.overrides_on_pipeline` (see [errors](../reference/errors.md)).

## Ending a pipeline

A pipeline ends as a run does. A mapped call that ends `budget_out`, `stopped` or
`waiting_for_person` ends the pipeline the same way. Continue it with
`fluxiq.resumePipeline(built, run.resumeHandle!)`.
