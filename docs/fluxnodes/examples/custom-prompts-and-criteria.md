# A node with custom prompts and criteria

Read the current price of a product, with house rules for the model, extra things the judge
must hold the result to, a pace that is gentle on the site, and a model for each role.

```ts
import { FluxIQ, defineFluxNode, z } from "@fluxiq/sdk";

export const productPrice = defineFluxNode({
  name: "shop.product-price",
  runtime: "web",
  goal: "Read the current price of the product with SKU {sku}, including its currency.",
  start: "https://shop.example/",
  inputs: z.object({ sku: z.string() }),
  outputs: z.object({ price: z.number().min(0), currency: z.string().length(3) }),
  scope: { sites: ["shop.example"], acts: [] },
  options: { judge: "always", budgetUsd: 1 },
  overrides: {
    prompts: {
      // Steer the explorer. Append keeps Core's own wording and adds ours.
      "explorer.role.task": {
        mode: "append",
        text: "Prices live in the product header. Ignore prices in recommendations and ads."
      },
      // Replace a section wholesale when Core's wording does not fit.
      "core.efficiency": {
        mode: "replace",
        text: "Use as few steps as you can. Prefer the site's own search over browsing categories."
      },
      // Add care around the judge's verification.
      "judge.verification": {
        mode: "append",
        text: "A price shown struck through is the old price, not the current one."
      }
    },
    judgeCriteria: [
      "The price is the one a shopper would pay today, not a list price.",
      "The currency is a three-letter code such as USD or EUR."
    ],
    tools: {
      // Tool descriptions: description text only, never the input schema.
      "core.run_flow": { mode: "append", text: "Use it only after one row has been done by hand." }
    },
    models: { explore: "claude-sonnet-5-5", judge: "claude-haiku-5-5" },
    deadlines: { llmCallMs: 30_000, personWaitMs: 5 * 60_000 },
    retryWaits: { backoffMs: [500, 1500, 3000] },
    pace: { minStepGapMs: 400 }
  }
});

const fluxiq = await FluxIQ.connect();
const run = await fluxiq.run(productPrice, { sku: "A1" });

console.log(run.status, run.verdict); // achieved { label: "confirmed", by: "judge" }
console.log(run.overridesDigest);     // the same digest for every run that used these overrides
```

## Why each part is the way it is

- `explorer.role.task` is open, so we append. A hint that stays true across site redesigns
  is better than one about layout.
- `core.efficiency` is open, so replacing it is allowed. You take over the whole section.
- `judge.verification` is open, and the judge reads it. Editing it changes what the judge
  reads, so the next run is judged again (see [judging results](../guides/judging-results.md#re-judging-when-criteria-change)).
- `judgeCriteria` need `judge` to run, so the node sets `judge: "always"`.
- `core.run_flow` is an open tool. `core.run_node` could only be appended to.
- `models` per role is in the contract. The engine routes each role to its own model with the
  next release. Until then, set `options.model`. See [choosing models](../guides/choosing-models.md).

## Change it for one run

A run's entries replace the declared ones. They do not stack.

```ts
const run = await fluxiq.run(productPrice, { sku: "A1" }, {
  overrides: {
    budgetUsd: 0.25,                                              // an option: sent as options
    prompts: { "explorer.role.task": { mode: "default" } },       // drop the declared append
    judgeCriteria: ["The price is in euros."],                    // replaces both declared criteria
    pace: { minStepGapMs: 1000 }                                  // merged leaf by leaf
  }
});
```

`budgetUsd` is an option and the rest are overrides. In the SDK you write them in one object,
and the SDK sends them in the right fields.

## What is refused

```ts
defineFluxNode({
  /* ... */
  overrides: { prompts: { "core.output_rules": { mode: "append", text: "..." } } }
});
// SdkError invalid_definition: The section "core.output_rules" is locked ...
```

See [safety](../guides/safety.md).
