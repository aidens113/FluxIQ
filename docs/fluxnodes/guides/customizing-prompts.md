# Customizing prompts

Core builds the prompts a model reads out of named **sections**. You can add to a section or
replace it, one section at a time, and nothing else about the prompt moves. The full table of
sections is in [overrides](../reference/overrides.md#sections).

## Append or replace

```ts
import { defineFluxNode } from "@fluxiq/sdk";

const node = defineFluxNode({
  name: "shop.price",
  runtime: "web",
  goal: "Read the price of {sku}.",
  start: "https://shop.example/",
  scope: { sites: ["shop.example"], acts: [] },
  overrides: {
    prompts: {
      // Add a hint after Core's own text. Most changes should be this.
      "explorer.role.task": { mode: "append", text: "Prices are in the product header, not the sidebar." },
      // Swap Core's text for yours.
      "core.efficiency": { mode: "replace", text: "Prefer the fewest steps. Never open more than two tabs." }
    }
  }
});
```

- **append** adds your text after the default, with a blank line between. Core's wording keeps
  working and yours steers it. Up to 4000 characters.
- **replace** removes the default and uses yours. You own the whole section. Up to 8000
  characters.

Start with append. Replace only when Core's wording is wrong for your task, because you take
over everything the old text did.

## Open, append-only and locked

Each section has a policy.

| Policy | You may | Why |
| --- | --- | --- |
| `open` | append or replace | It guides the model's judgement and nothing more. |
| `append_only` | append only | It holds a safety rule. You may add to it, but the rule must stay. |
| `locked` | nothing | It holds words that a mechanical gate or a reply format depends on. |

Examples:

- `explorer.role.landed` is append-only. It tells the model that an act that already landed is
  never done again. Replacing it could let a run send a message twice.
- `domain.instructions` is append-only. It holds the runtime's own rules, including what to do
  at a robot check.
- `core.output_rules` is locked. It describes how replies are parsed.
- `judge.fields` and `judge.order` are locked. The judge's reply must keep its shape.

A locked or append-only mistake is refused with a named code, and the message names the section.
`defineFluxNode` throws it at definition time. See [errors](../reference/errors.md#overrides-codes).

Locks protect words. The gates themselves (scope, permissions, robot-check detection, secret
screening) are mechanical and are not reachable from any override. See [safety](safety.md).

## Layering

Set a prompt on the declaration for every run, and again on one run to change it there.

```ts
await fluxiq.run(node, { sku: "A1" }, {
  overrides: {
    prompts: {
      "explorer.role.task": { mode: "append", text: "Prefer the price shown after sign-in." }
    }
  }
});
```

For one section, the run's entry **replaces** the declared entry whole. It does not stack on
top. So this run reads Core's default plus the run's one append, not the declared append too.

To drop a declared entry for one run and go back to Core's default:

```ts
{ overrides: { prompts: { "explorer.role.task": { mode: "default" } } } }
```

## Judge text

The judge reads `judge.verification` and `judge.question`, both open, and your
`judgeCriteria`. Changing what the judge reads makes the next run judged again, even if the
learned Flow would otherwise be replayed without a judge. See [judging results](judging-results.md).

## Tool descriptions

`tools` works the same way, on a tool's description. Bounds are shorter: 1000 characters to
append, 2000 to replace. The tool's input schema never changes. `core.run_node` and any tool
that is not on Core's list are append-only.

## Tips

- Say what, not how. "Prices are in the header" lasts. "Click the third link" breaks.
- Put what the task is in the `goal`. Overrides are for how the model should behave while it
  does it, and the goal is part of the task's identity while overrides are not.
- Keep an eye on `overridesDigest` in the result. Two runs with the same digest read the same words.
- Total override text is at most 32000 characters across all prompts, tools and criteria.
