# FluxNode spec

`defineFluxNode(definition)` validates your declaration with the same parser the engine
uses, so a mistake shows up where you wrote it. It throws an `SdkError` with code
`invalid_definition` and one line per issue.

```ts
import { defineFluxNode, z } from "@fluxiq/sdk";

const node = defineFluxNode({
  name: "shop.price",
  runtime: "web",
  goal: "Read the price of {sku}.",
  start: "https://shop.example/",
  inputs: z.object({ sku: z.string() }),
  outputs: z.object({ price: z.number(), currency: z.string() }),
  scope: { sites: ["shop.example"], acts: [] },
  check: ({ outputs }) => outputs.price > 0 || "the price must be above zero",
  options: { budgetUsd: 1 },
  overrides: { judgeCriteria: ["The price includes the currency."] }
});
node.name; // "shop.price"
node.spec; // the validated spec
await node.hash(); // the spec hash
```

Unknown keys are refused everywhere in a spec.

## Fields

| Field | Required | What it is |
| --- | --- | --- |
| `name` | yes | The FluxNode's name. 1 to 7 dotted parts of lowercase `a-z`, `0-9`, `_` and `-`, each starting and ending with a letter or digit, at most 64 characters a part and 128 in all. Example: `market.cheapest-listings`. The learned Flow is filed at `nodes/market/cheapest-listings`. |
| `runtime` | yes | Where the steps run. `web`, `android`, `linux` and `windows` are the ones Core knows. Any other id of 1 to 32 lowercase `a-z`, `0-9` and `-`, starting with a letter, is accepted for a host that declares it. |
| `goal` | yes | What to achieve, as one sentence or more. 1 to 4000 characters, trimmed, no control characters. A `{placeholder}` names a declared input. `{{` and `}}` write a literal brace. |
| `start` | yes | Where a run starts. 1 to 2048 characters. For `web`, an `http` or `https` address inside `scope.sites`. For another runtime, that runtime's own start (an app, a screen). |
| `inputs` | no | The input type: a JSON Schema in the supported subset whose `type` is exactly `"object"`. With zod, `z.object({...})`. |
| `outputs` | no | The output type, in the same subset. A zod schema types `run.outputs` for you. |
| `scope` | yes | The standing grant. See below. |
| `check` | no | A function that runs in your process. The spec only records `hasCheck: true`; the function never leaves your program. |
| `uses` | no | Other FluxNodes this one calls, by name or object. At most 64. Never itself. Repeats are dropped. |
| `options` | no | [Options](options.md), each optional. |
| `overrides` | no | [Overrides](overrides.md), each optional. |

## Goal placeholders

`Find the {count} cheapest listings for {query}.` needs `count` and `query` under
`inputs.properties`. A placeholder name is a letter or `_` followed by letters, digits and `_`.

At run time each placeholder is replaced by its input. Text goes in as written. Any other
value goes in as canonical JSON. A [secret input](#secret-inputs) is the exception: its
placeholder names the input and never holds its value.

## Scope

The scope is the standing grant. You give it before the run starts, so nothing asks mid-run.

| Field | Meaning |
| --- | --- |
| `sites` | Host names the run may use, such as `market.example` or `localhost:3000`. No scheme and no path. Each covers itself and its subdomains. A port, when given, must match. Lowercased. At most 64. Absent means no restriction by site. |
| `apps` | App ids or names the run may use, such as `com.example.messages`. 1 to 128 characters of letters, digits, `.`, `_`, `+`, `-` and spaces. At most 64. |
| `acts` | The lasting acts granted: `change`, `send`, `money`, `delete`. At most 8. `[]` grants none, so the run may only read. `"read"` is accepted and dropped, because reading is always allowed. |

An act outside the scope is refused. The run looks for another way within its budget. See
[safety](../guides/safety.md).

## The check

```ts
check: ({ outputs, inputs }) => true | false | "a reason"
```

- Return `true` to pass.
- Return a string or `false` to send the run back with a "no". The string is the reason, and
  the run reads it and tries again.
- A check that throws, or returns anything else, is also a "no" with a reason. It never ends the run.

The check runs after the type and before any judge. See [judging results](../guides/judging-results.md).

## What is and is not the task's identity

The spec hash is the SHA-256 of the canonical form of `runtime`, `goal` (whitespace
collapsed), `start`, `inputs`, `outputs` and `scope`. With `name` it is the task key.

| Change | Result |
| --- | --- |
| `goal`, `start`, `runtime`, `scope`, `inputs`, `outputs` | A new task. A new learned Flow starts beside the old one. |
| `options`, `check`, `uses`, `overrides` | The same task. The learned Flow is kept. |

Overrides are left out of the hash on purpose. Otherwise every wording tweak would throw
away a Flow that works. When a change would alter what the judge reads, the engine judges
the next run again. See [judging results](../guides/judging-results.md).

## Input and output types

`inputs` and `outputs` take zod schemas, converted for you, or raw JSON Schema in this subset.

- Every value: `type`, `enum`, `const`, `anyOf`, `oneOf`, and the notes `title`, `description`, `default`, `examples`.
- Objects: `properties`, `required`, `additionalProperties`.
- Arrays: `items`, `minItems`, `maxItems`.
- Strings: `minLength`, `maxLength`, `format` (`date-time`, `date`, `uri`, `email`, `secret`). A format is asserted, not just noted; `secret` fits any text of at least 4 characters and is for inputs only (below).
- Numbers: `minimum`, `maximum`.

A value that may be null says so in `type`, as `["string", "null"]`. A keyword for one kind of
value needs `type` to name that kind. See [limits](limits.md) for the bounds on a schema.

A type is checked at no model cost. Outputs that do not fit are a "no" naming where.

### Secret inputs

A password, an API key or anything else the engine must never show or keep is a secret input:
`format: "secret"` in JSON Schema, or `secret()` from the SDK.

```ts
import { defineFluxNode, secret, z } from "@fluxiq/sdk";

const signIn = defineFluxNode({
  name: "notes.sign-in", runtime: "web", start: "https://notes.example/",
  goal: "Sign in as {user} with the password {password} and list the notebooks.",
  inputs: z.object({ user: z.string(), password: secret() }),
  scope: { sites: ["notes.example"], acts: [] }
});
```

- **Where.** Only on a string input declared directly under the FluxNode's `inputs.properties`.
  It is refused (`type_schema.secret_not_input`) on an output, a nested field, an `anyOf` branch,
  a pipeline's inputs and a data step's type, since each of those is returned or stored as it is.
- **What it may not hold.** No `default`, `examples`, `const` or `enum` beside it
  (`type_schema.secret_with_value`): the spec, its hash and every export would carry them.
- **Its value** is at least 4 characters. Core withholds every occurrence of a secret in what the
  model reads, so a shorter one would blank ordinary text; it is refused as an input that does not
  fit (`invalid_inputs`, issue code `format`).
- **Its name** is a lowercase letter then up to 31 letters and digits, and not `item`
  (`type_schema.secret_bad_name`), because a step reaches it by that name.
- **The model never sees it.** The goal's placeholder becomes words naming the input, the
  model writes the step that needs it with a binding to that name, and the engine puts the value
  in when the step runs, while exploring and on every replay.
- **Nothing keeps it.** The saved Flow, the [export](http-api.md) and a pinned version hold the
  binding with no default; every step file, trace, saved command, event and result shows
  `[withheld]` where the value was. Your `check` gets the inputs with the secret withheld too.
- **Every run gives it again.** A run without it has nothing to type, and that step fails rather
  than using a remembered value. A replay with another value types the new one.

Withholding replaces every occurrence of the value in any text, so a very short secret also
blanks matching page text the model reads. See [safety](../guides/safety.md#secret-inputs).

## Registering without running

```ts
const fluxiq = await FluxIQ.connect();
const done = await fluxiq.register(node);
// { name, specHash, flowPath, created, previousSpecHash? }
```

Registering is safe to repeat. `created` is false when the name and hash were already
registered. `previousSpecHash` is present when the name already had a different latest spec,
so you can tell that a new learned Flow starts.
