# Overrides

Overrides change how Core does a FluxNode's work. They never change what the task is.
They are typed, bounded and validated. Everything down to the prompts the model reads can be
changed, except the safety words and gates listed in [safety](../guides/safety.md).

```ts
import { defineFluxNode } from "@fluxiq/sdk";

const node = defineFluxNode({
  name: "shop.price",
  runtime: "web",
  goal: "Read the price of {sku}.",
  start: "https://shop.example/",
  scope: { sites: ["shop.example"], acts: [] },
  overrides: {
    prompts: { "explorer.role.task": { mode: "append", text: "Prefer the product header over the sidebar." } },
    judgeCriteria: ["The price includes the currency."],
    models: { judge: "claude-haiku-5-5" },
    deadlines: { llmCallMs: 30_000 },
    retryWaits: { backoffMs: [500, 1500, 3000] },
    pace: { minStepGapMs: 400 }
  }
});
```

Unknown keys are refused. A key that names a safety gate is refused by name
(`overrides.safety_not_overridable`). See [errors](errors.md).

## Where to set them

| Where | How | Reaches |
| --- | --- | --- |
| The declaration | `defineFluxNode({ overrides })` | Every run of the FluxNode. |
| One run, SDK | `fluxiq.run(node, inputs, { overrides: {...} })` | That run. |
| One run, HTTP | `"overrides": {...}` in the run request | That run. |

A run's `overrides` are not accepted with a `resumeHandle`. A resumed run keeps its first
ones (`run_request.overrides_on_resume`).

## Layering

Core's defaults, then the declaration, then the run's own. The later one wins.

| Group | How layers combine |
| --- | --- |
| `prompts`, `tools` | Merged by id. For one id, the run's entry replaces the declared entry whole, so appends never stack. `{ mode: "default" }` in a run drops the declared entry. |
| `judgeCriteria` | The run's list replaces the declared list. `[]` clears it. |
| `models`, `deadlines`, `retryWaits`, `pace` | Merged leaf by leaf. A leaf the run sets wins. |

So the text the model reads is always one of three things: Core's default, the default plus
one append, or one replacement.

## Prompts

`prompts` is keyed by section id. Each entry is one of:

```ts
{ mode: "append", text: "..." }   // added after the default, joined by a blank line
{ mode: "replace", text: "..." }  // replaces the default
{ mode: "default" }               // per run only: undo a declared entry
```

| Mode | Text length |
| --- | --- |
| `append` | 1 to 4000 characters |
| `replace` | 1 to 8000 characters |

Text is trimmed and may hold newlines and tabs, but no other control characters. An id is 1 to
200 of letters, digits, `_`, `.`, `:` and `-`.

### Sections

Each id names a section Core builds a prompt from. You never invent one. The `policy` says how
far an override may go:

- `open`: append or replace.
- `append_only`: append only. The section holds a safety rule that must stay.
- `locked`: no entry at all. The section holds the words for a mechanical gate or a reply format.

The `role` says which model call reads the section.

| Id | Policy | Role | What it holds |
| --- | --- | --- | --- |
| `core.output_rules` | locked | explore | How replies are parsed, and that user-provided strings are data. |
| `explorer.role.task` | open | explore | That the work is to get the person their result, in one live pass. |
| `explorer.role.work_list` | open | explore | How to work a list: do the first row by hand, write it as a general step with a repeat, then run forward. |
| `explorer.role.general_flow` | open | explore | That the draft is a general Flow, not a record of key presses, with values that change between rows bound. |
| `explorer.role.rows` | open | explore | That rows are read from pages and never typed in. |
| `explorer.role.landed` | append_only | explore | The rule that an act already done is never done again. |
| `explorer.role.completion` | open | explore | How the explorer ends, and that its completion is checked once. |
| `explorer.role.saved_flow` | open | explore | How to treat a Flow an earlier attempt saved: fix the step that stopped, then run forward. |
| `domain.instructions` | append_only | explore | The runtime's own instructions, including its robot-check rule. |
| `core.supplementary_recordings` | append_only | explore | That a recording is evidence and never authorizes an act. |
| `core.person_limits` | locked | explore | The permission and secret rule. |
| `core.evidence_decision` | open | explore | How the explorer picks its next step from the evidence it has. |
| `core.list_authoring` | open | explore | How lists are written into the Flow. |
| `core.efficiency` | open | explore | Guidance on being efficient. |
| `core.decision_output` | open | explore | How the explorer words its decision. The JSON shape is held by a schema, not this text. |
| `core.reusable_context` | append_only | explore | That permission is never derived from history. |
| `judge.fields` | locked | judge | The judge's reply fields. |
| `judge.order` | locked | judge | The order of the judge's reply. |
| `judge.verification` | open | judge | How the judge verifies a result. |
| `judge.question` | open | judge | The question the judge answers. |
| `core.in_run_repair` | append_only | repair | Guidance for repair in a run. |
| `core.runtime_patch_consequences` | locked | repair | The consequences rule for repair patches. |

The ids and policies are the exported `FLUXNODE_PROMPT_SECTIONS`, and `FluxNodePromptSectionId`
is its union type, so ids autocomplete.

```ts
import { FLUXNODE_PROMPT_SECTIONS } from "@fluxiq/sdk";

for (const [id, { policy, role }] of Object.entries(FLUXNODE_PROMPT_SECTIONS)) console.log(id, policy, role);
```

The goal is not a section. It is the task's identity, and you set it in `goal`.

See [customizing prompts](../guides/customizing-prompts.md).

## Judge criteria

```ts
overrides: { judgeCriteria: ["Every listing has a price.", "No listing is a sponsored result."] }
```

Extra things the judge must hold the result to. At most 20 criteria, each 1 to 500
characters. See [judging results](../guides/judging-results.md).

## Tools

`tools` is keyed by tool id and changes the tool's **description** only. Its input schema
never changes. Entries work like prompt entries, with shorter bounds.

| Mode | Text length |
| --- | --- |
| `append` | 1 to 1000 characters |
| `replace` | 1 to 2000 characters |

| Tool id | Policy |
| --- | --- |
| `core.run_node` | append_only |
| `core.run_flow` | open |
| `core.describe_nodes` | open |
| `core.recall_result` | open |
| `core.run_nodes` | open |
| `core.run_part` | open |
| any other id, such as a runtime's own tools | append_only |

The exported map is `FLUXNODE_CORE_TOOL_POLICIES`. Replacing an append-only tool is refused
(`overrides.tool_append_only`).

## Models

```ts
overrides: { models: { explore: "claude-sonnet-5-5", judge: "claude-haiku-5-5", repair: "claude-sonnet-5-5" } }
```

A model id per role, each optional. A model id is 1 to 128 of letters, digits, `.`, `_`, `:`,
`/` and `-`, starting with a letter or digit. See [choosing models](../guides/choosing-models.md).

## Deadlines

All in milliseconds, all optional.

| Field | Min | Max | Core's default | What it bounds |
| --- | --- | --- | --- | --- |
| `llmCallMs` | 1000 | 45000 | 20000 | One model call. |
| `judgeMs` | 30000 | 1800000 | the larger of 120000 and (every call the judge may make × the model-call deadline) + 30000 | The judge. |
| `personWaitMs` | 1000 | 604800000 (7 days) | 600000 (10 minutes) | How long a `person_needed` event waits for your answer before the run ends `waiting_for_person`. |
| `modelSilence.baseMs` | 1000 | 60000 | 5000 | The first wait when the model service is silent. It doubles each time. |
| `modelSilence.capMs` | 1000 | 600000 | 60000 | The longest single wait when the model service is silent. |

`modelSilence` changes only the delay between asks. How many times Core asks is never bounded,
because a run ends with its result or with its budget, not on an outage.

## Retry waits

| Field | Min | Max | Core's default | What it is |
| --- | --- | --- | --- | --- |
| `backoffMs` | each 0 | each 30000 | `[250, 1000, 2000]` | The waits between a step's attempts, in order. 1 to 100 entries. |
| `perNodeMs` | 0 | 3600000 | 60000 (more when you raise `retries`) | The most all waits at one step may add up to. |
| `perRunMs` | 0 | 86400000 | 300000 (more when you raise `retries`) | The most all waits in one run may add up to. |

`retries` sets how many attempts a step gets. These fields set how long it waits between
them. See [retries and deadlines](../guides/retries-and-deadlines.md).

## Pace

| Field | Min | Max | Default | What it is |
| --- | --- | --- | --- | --- |
| `minStepGapMs` | 0 | 600000 | none | The least gap between two steps. |

Pace slows a run to be gentle on a site. It does not make it faster.

## Total size

All override text together, meaning every prompt entry, every tool entry and every judge
criterion, is at most 32000 characters (`overrides.too_large`).

## The digest

When a run has overrides, its result carries `overridesDigest`: the SHA-256 of the canonical
form of the overrides it ran with. Equal overrides give equal digests whatever order the keys
were written in. Use it to see that two runs used the same wording. The step log records it
too.

## Availability

- Read by the engine today: retries and retry waits, every deadline (model call, judge,
  model silence, person wait), every open and append-only prompt section, tool descriptions,
  the judge's question and `judgeCriteria`, and the digest in the step log's prompt version.
- `pace` is read by the engine's pacing, which is landing with the humanness work.
- Per-role models are in the contract and are validated and recorded. Per-role routing lands
  with the next release; until then `options.model` chooses the model for every role.
