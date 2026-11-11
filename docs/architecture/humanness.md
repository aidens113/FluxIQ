# Humanness

Humanness is one setting, a whole number from 0 to 100, that says how much like a person a run's input looks. At 0 a run acts at maximum efficiency, which is what scraping a site with no account needs. Higher levels look more human on sites that limit how fast or how mechanically they are used. It is the person's chosen behaviour, never a fix for a failure: a run that fails is traced to its cause at every level.

0 is the default everywhere, because speed is the product's first priority. A person raises it per site or per use: a slider in the browser extension's settings, `options.humanness` on a FluxNode or its per-run overrides, `humanness` on the answer-first caller options, or `humanness` on a chat turn or run request.

## Level 0 is today's path exactly

At 0, or when nothing sets a level, nothing about a run changes:

- no added waits before a node, between typed characters or after a scroll;
- clicks land on the point the actionability gate chose, centre first;
- typing is the same synchronous per-character sequence;
- no misclick;
- browser commands carry no `humanness` key, and the trace has no `humanness` record.

Each of these is held by a test beside the code that would change it.

## What a level changes

With `b = level / 100`:

| Where | What | Shape |
| --- | --- | --- |
| Core, before each node's first arrival (`engine/automation/pacing/human-pause.ts`) | A pause; never on a retry of the same node | `1000·b·(0.8·E + R)` ms, where `E` is exponential with mean 1 and `R` is a reading pause of `2·(0.5 + u)` taken with chance `0.2·b`. The mean is about 8 ms at level 1 and about 1.2 s at level 100. |
| Content script, click (`content/action-runtime/humanness/`, extension) | The press point | Near the centre, inset 20% per side (at least 2 px), within 40 px, spread `0.4 × reach × b`. Used only when the gate accepted the centre, and re-hit-tested (see below). |
| Content script, typing | A gap before each character after the first | Right-skewed, mean `160 ms × b`, with a 5% chance of a hesitation of 2-6 gaps. Number and date inputs keep their whole-value path. |
| Content script, scroll | One dwell after the scroll | Right-skewed, mean `900 ms × b`. A scroll-until-stable dwells once, after its last pass. |
| Content script, misclick | At most one, before the real press, only on a step Core marks safe | Chance `8% × b` per marked command. |

The content script plans all of one command's pauses to fit within 40% of that command's own time, its timeout without the robot-check allowance. A longer plan is scaled down, never failed.

## Safety lines

These hold at every level:

- **Robot checks still pause for the person.** Humanness never touches the robot-check wait, its allowance, or the person-needed pause.
- **Jittered points stay on the target.** An aimed point must be strictly inside the target's visible box and pass the gate's own hit test on the target and on the same control as the centre's hit. Otherwise the press uses the gate's point. Events always go to the target element.
- **Misclicks only on inert points, never on a lasting act.**
  - Core marks a command `humannessMisclick: true` only when the level is above 0, the node declared an empty consequence list (`metadata.declaredConsequences` present and empty), and Core's lasting and mutating checks clear both the node and the dispatched output (`engine/automation/defensive/`). A missing declaration is not "not lasting". Without the mark the page never misclicks.
  - The page refuses a misclick while any dialog, popover, menu, listbox or overlay is open, and never clicks a backdrop: many pages close a layer on any outside click, and delegated handlers are invisible to a content script.
  - The point must lie outside the target's box, on page content where neither the hit element nor any ancestor (through shadow roots) is interactive: a link, button, form control, label, summary, control role, `tabindex`, `contenteditable`, an `onclick` handler, or `cursor: pointer`.
  - If the misclick changed the page, the target is measured again before the real press. The press itself is the one the run would have made without the mark.
- **The evidence-based page pace applies at every level.** Slowing down after a 429 or 503 (`pacing/rate-limit-pace.ts`) is independent of humanness.

## Seeds and replay

Every random choice comes from a seeded generator, `humannessRandom(seed)` (mulberry32, from `@fluxiq/contracts`), so a run can be reproduced from its records:

- **Core node pauses:** the run's seed is `humannessSeedOf("run:<startedAt>")`, unless the caller passes `humannessSeed` to replay a run. Child frames inherit it. The trace records it as `humanness: { level, seed }`. Each pause draws from `humannessRandom(humannessSeedOf("<seed>:<nodeId>:<arrival ordinal>"))`, so pauses share no state and replay exactly.
- **Content-script choices:** each command seeds its own generator from its command id, `humannessSeedOf(commandId)`, which the step log already records. The misclick draws from a separate stream seeded by the same id, so it never shifts the aim, cadence or dwell choices.

## A developer's least step gap

A FluxNode developer can set `pace.minStepGapMs` in the run's overrides (W3's FluxNode overrides; the run frame is `runtime/run-overrides`). It is a floor on the pause before each node's first arrival, at every level: at level 0 the run waits exactly that floor and nothing else. With no floor and level 0, the run awaits nothing.

## Where the level travels

- **From a run's options to the page:**
  - The level is set in FluxNode options or overrides, or in the answer-first caller options.
  - It goes into `AutomationStudioGraphExecutionOptions.humanness`, then into the node attempt's effect-dispatch context, then into `runtime.dispatch`.
  - From there it rides `ClientGatewayActionCommand.humanness`, and the domain mapping in the web extension passes it on to `BrowserActionCommand.humanness`.
  - A command carries the field only when the run's options set it, 0 included.
- **When the run sets none:** the extension's background stamps the person's saved setting on each command, if it is above 0.
- **For chat turns and run requests:** the extension sends the saved setting with each turn and run request. Core validates it with `humannessSchema` where it reads the request body.

The contract (`HUMANNESS_MIN`, `HUMANNESS_MAX`, `HUMANNESS_DEFAULT`, `humannessSchema`, `normalizeHumanness`, `humannessRandom`, `humannessSeedOf`) lives in `packages/contracts/src/humanness/`. It is exported from `@fluxiq/contracts` and its `./automation` and `./runtime` subpaths; the engine imports it from `./runtime`.
