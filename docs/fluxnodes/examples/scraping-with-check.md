# A scraping node with a check

Read the cheapest listings for a search. The type guarantees the shape, and a check guarantees
the answer is sensible. The first run explores. Later runs replay at no model cost.

```ts
import { FluxIQ, defineFluxNode, z } from "@fluxiq/sdk";

const listing = z.object({
  title: z.string().min(1),
  price: z.number().min(0),
  url: z.string().url()
});

export const cheapestListings = defineFluxNode({
  name: "market.cheapest-listings",
  runtime: "web",
  goal: "Find the {count} cheapest listings for {query}, cheapest first.",
  start: "https://market.example/",
  inputs: z.object({ query: z.string(), count: z.number().int().min(1).max(10) }),
  outputs: z.object({ listings: z.array(listing) }),
  scope: { sites: ["market.example"], acts: [] }, // read only
  check: ({ outputs, inputs }) => {
    const { listings } = outputs;
    if (listings.length !== inputs.count) return `Expected ${inputs.count} listings, got ${listings.length}.`;
    const prices = listings.map((each) => each.price);
    if (prices.some((price, index) => index > 0 && price < prices[index - 1]!)) return "The listings are not ordered cheapest first.";
    if (new Set(listings.map((each) => each.url)).size !== listings.length) return "Two listings share a link.";
    return true;
  },
  options: { budgetUsd: 1, retries: 4 }
});

const fluxiq = await FluxIQ.connect();

const first = await fluxiq.run(cheapestListings, { query: "lens hood", count: 3 });
console.log(first.status, first.path, first.cost); // achieved explored { calls: 12, ... }

const second = await fluxiq.run(cheapestListings, { query: "lens hood", count: 3 });
console.log(second.status, second.path, second.cost); // achieved replayed { calls: 0, tokens: 0, usd: 0 }

if (second.status === "achieved") {
  for (const each of second.outputs.listings) console.log(each.price, each.title);
}
```

The numbers in the comments show the shape, not a promise. Your first run's call count depends
on the site.

## What to notice

- `second.outputs.listings` is typed, because `outputs` is a zod schema.
- The check runs in your process. A string it returns goes back into the run as a "no" with a
  reason, so the run can fix the ordering or the count instead of ending.
- A different `query` is the same task. Inputs never change the spec hash, so the learned
  Flow is reused. It replays on the new query.
- The check is not part of the task's identity. Tighten it later and the learned Flow is kept.

## Handling every ending

```ts
const run = await fluxiq.run(cheapestListings, { query: "lens hood", count: 3 });

switch (run.status) {
  case "achieved":
    console.log(run.outputs.listings);
    break;
  case "budget_out":
    // The best partial result is in run.outputs, if there is one. Continue from where it stopped.
    await fluxiq.resume(cheapestListings, run.resumeHandle!);
    break;
  case "waiting_for_person":
    console.log(run.waitingFor); // for example: clear a check on the page
    break;
  case "stopped":
    console.log("Stopped.");
    break;
}
```

`resume` keeps the first run's inputs, options and overrides. It takes no options of its own.
