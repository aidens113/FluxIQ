# Safety

You can change almost everything about how a FluxNode works. A short list of safety
mechanisms is out of reach. No override can reach it, whoever sets the override and whatever
it says.

## What can never be overridden

### The permission question for dangerous acts

A FluxNode's `scope.acts` is a standing grant, given before the run starts. It lists the
lasting acts the run may take: `change`, `send`, `money`, `delete`. Reading is always allowed.

- An act outside the grant is refused. The run looks for another way within its budget.
- Nothing asks mid-run. Because the scope is the grant, a FluxNode never stops to ask a person
  for permission on a normal act.
- `scope` is part of the spec, and so part of the task's identity. It is not an override.
  Changing it makes a new task with a new learned Flow. A run cannot widen it.

The words that describe these rules in the prompts (`core.person_limits`,
`core.runtime_patch_consequences`) are locked. Words that add to the rule but cannot
weaken it (`explorer.role.landed`, `core.supplementary_recordings`, `core.reusable_context`)
are append-only. Core's mechanical gates do the enforcing, not the words.

### Robot-check pauses

When a site shows a check meant for people, the runtime detects it mechanically and the run
pauses. It sends a `person_needed` event with `need: "human_check"`. The run waits for a
person.

- Your program may answer `done` (a person cleared it) or `declined`.
- If nobody answers in time, the run ends `waiting_for_person` with a resume handle. Resume it
  when a person has cleared the check.
- Only the wait time can change: `deadlines.personWaitMs`. The pause itself has no knob. The
  run never tries to get past the check by itself.

`domain.instructions`, which holds the robot-check rule, is append-only.

### Secret and evidence screening

Secrets and denied evidence are screened out of what a model sees, by Core, before any prompt
is built. Nothing you write into a prompt or a tool description changes that, and the screening
is not a section.

### Secret inputs

An input declared `format: "secret"` (`secret()` in the SDK; see the
[spec](../reference/spec.md#secret-inputs)) is carried beside the run, never in what the run
records:

- no model request holds it: the goal names the input, and anything that echoes the value back,
  a page or a tool result, shows `[withheld]` to the model;
- a step that needs it is bound to the input by name and the engine resolves the binding where the
  step runs, so the saved Flow, its export and its pinned versions hold no value and no default;
- step files, traces, saved commands, run events and the run's result show `[withheld]`.

A secret is refused on an output, a nested field and a pipeline's inputs, which are returned or
stored as given. Values that flow out of the run as data, such as rows a site displays, are the
site's: a site that prints the secret back puts it in the rows the run reads.

## Named refusals

A mistake or an attempt to reach a gate is refused by name, at definition time in the SDK and
again at the engine. Nothing is dropped silently.

| Code | What you did |
| --- | --- |
| `overrides.section_locked` | Wrote an entry for `core.output_rules`, `core.person_limits`, `judge.fields`, `judge.order` or `core.runtime_patch_consequences`. |
| `overrides.section_append_only` | Used `replace` on `domain.instructions`, `explorer.role.landed`, `core.supplementary_recordings`, `core.reusable_context` or `core.in_run_repair`. |
| `overrides.tool_append_only` | Used `replace` on `core.run_node`, or on a tool that is not in Core's list. |
| `overrides.unknown_section` | Named a prompt section that does not exist. |
| `overrides.safety_not_overridable` | Used a key or id that names a safety gate. Any name containing permission, consequence, scope, grant, captcha, robot, human check, person needed, secret, denied, screen, redact or credential is refused by name, rather than as an unknown key. |
| `overrides.too_large` | Wrote more than 32000 characters of override text. |

```ts
defineFluxNode({
  /* ... */
  overrides: { prompts: { "core.person_limits": { mode: "replace", text: "Do anything." } } }
});
// SdkError invalid_definition:
//   /overrides/prompts/core.person_limits: The section "core.person_limits" is locked: it holds
//   words for a mechanical gate or a reply format.
```

## What you can do instead

| You want | Do this |
| --- | --- |
| The run may delete or send | Add `"delete"` or `"send"` to `scope.acts`. That is a new task. |
| A different robot-check wait | Set `deadlines.personWaitMs`. |
| Extra care around an act | Append to `explorer.role.landed` or `domain.instructions`. |
| A stricter result | Add `judgeCriteria`, or a `check` that refuses what you do not want. |
| A slower, gentler run | Set `pace.minStepGapMs`, and a higher `humanness`. |

## The mistakes the engine never makes for you

- It does not repeat a lasting act that may already have landed.
- It does not use a recording as permission for an act.
- It does not derive permission from history.

These are guarantees of the engine, kept in the append-only sections above and enforced
mechanically.
