# P8a sim bindings: worker report

Repo: `C:/Users/osrs_/FluxStuff/!FluxIQTestEnvironments`, branch `feat/sim-bindings`, uncommitted. Core and the web extension repo were not edited.

## Outcome

Done. FluxIQ's engine now drives the simulated Android, Linux and Windows environments through one generic binding package. One Answer First attempt per environment, with a scripted model and no provider, ends `achieved` / `done_on_site` / `confirmed`, and each task's own oracle accepts the change. No Core seam was missing. Five Core behaviours had to be met from the binding side; they are listed under Open questions.

## What changed and why

**1. sim-kit gaps (additive, `packages/sim-kit/src/contract.ts`)**
- `SimTask.survives?: string[]` was added.
- `Observation.busy?: boolean` was added.
- The `attributes` doc now says values are strings and every boolean is a `states` entry.
- Every task in all three environments declares `survives` from a per-environment list (`packages/*/src/tasks/survives.ts`).
  - A probe ran every Windows task under every perturbation, alone and together, on seeds 1-3. All passed, so every task truthfully survives every perturbation. Android and Linux tests already ran the full matrix.
  - The existing matrices now read `task.survives`.
  - New `tasks/tests/survives.test.ts` files check that each list matches the package's perturbation ids.
- `busy` is set where something visibly runs:
  - Android: a loading spinner is on screen. This is the visible signal, not the screen's hidden load window.
  - Linux: a command is running or a window is opening.
  - Windows: an Explorer folder is loading.
- The honest-path waits now read `busy` (Android `settle`, Windows `waitWhileLoading`, Linux `sh`).

**2. New `packages/fluxiq-binding`** (links Core as `link:../../../!FluxIQ/packages/fluxiq` and builds against its dist). One generic package; every directory has a barrel and a `tests/` folder.

| Part | What it does |
| --- | --- |
| `naming/` | The ids `sim.<kind>`, `sim.<kind>.<action>` and `sim.<kind>.look`. Maps act classes to Core's consequences: `change` is covered by `modify_existing` or `create_new`; `send`, `money` and `delete` each map one to one. |
| `view/` | The compact observation text: surface, title, `busy`, events, output, then one indented line per node: `<handle> <role> "<name>" = "<value>" [attrs] (states)`. |
| `session/` | `SimSession`, the one holder of the live environment. Events and text the host observed for itself are kept for the model's next look. `foresee` rehearses an act on a scratch copy (`pkg.create` + `restore(snapshot)`) and reads its act log's `landed`. It adds a `wait` action where the environment has none. |
| `session/targets.ts` | Stable handles (`e1`, ...) keyed by surface, role, name and the names of the nodes that hold it. Accepts a handle, Core's `{ handle }`, a descriptor, or a raw id. A Flow step keeps the descriptor, never a handle or a position. |
| `evidence/` | The `AutomationStudioLlmEvidenceRuntimeBinding`. One free look tool. The environment's actions are the library, offered through `core.run_node` (`runsNodes.runnable`), as the web domain does. Also: `observedStateKeys: ["view"]`, `stateDigestsOnCalls`, `describeCall` with `wouldRunWith`, and `resolvePlanNodeParameters` (handle to descriptor). An act is foreseen first. If it would land a class its call did not declare, it is refused with nothing done. Otherwise Core's permission check is asked, the act runs, and the evidence reports the act log's `landed`. |
| `nodes/` | One native node per `ActionSpec`, with parameters from its JSON Schema. Each implementation resolves its descriptor and acts on the session. |
| `manifest/` | The `DomainRegistration` per kind; outputs are the actions. |
| `adapter/` | An in-process `FluxIQRuntimeAdapter` (transport `native`): `execute_action`, `capture_snapshot` (the rendered view) and `read_state` (route state). It never returns hidden state. |
| `host/` | The `AutomationStudioHostRuntimeBoundary`. Snapshots this kind's nodes only and declines any other. Also gives the state diff, the route state (`surface`, `title`, `busy`, `dialog`), route signatures (surface and dialog) and their comparison. |
| `register/` | `registerSimEnvironment(fluxiq, { pkg, env, wording? })` wires all of the above. It is the only place that touches FluxIQ's binding points. |

- **Android wording** (`packages/android/src/fluxiq/wording.ts`) hides layout attributes such as bounds, class and the clickable flags. This cuts a Settings look from 5,084 to 1,616 characters and loses nothing. It is exported from `android/src/index.ts`, a one-line barrel edit outside `src/fluxiq`. Linux and Windows needed no wording.

**3. The proof** (`src/tests/answer-first.test.ts`, harness `scripted-attempt.ts`)
- Each attempt uses a temp root and a bootstrap `setup()`, as Core's own fixtures do, then `registerSimEnvironment`. The model is scripted like Core's fake library: the instruction read returns `instructed: []`, the judge says yes, and decisions come from the script.
- Script steps pick targets by role and name from the last view shown, using the handle that view printed.
- Proof tasks, one per environment:
  - Android: `settings-dark-mode-on-bluetooth-off`, two `change` acts.
  - Linux: `linux.append-config-line`.
  - Windows: `windows-registry-set-value`.
- The test asserts:
  - the attempt is `achieved`, its path is `explore`, and the result is `done_on_site` and `confirmed`;
  - Core's acts equal the act log's landed entries, each `landed`, and each declared class covers the landed class;
  - the first call is the look;
  - no replay, reset or write call happens;
  - the provider saw only `evidence_tool_decision` and `loop_verification`;
  - the system instructions reached the model;
  - the oracle passes.
- `binding-drive.test.ts` runs the same scripts through the binding without the engine.

## Commands run and observed results

- Free memory before each heavy run was 2.4-4.2 GB.
- `pnpm typecheck` (root) gave exit 0. All five packages ended with `typecheck: Done` (android, linux, windows, sim-kit, fluxiq-binding).
- `pnpm test` (root) gave exit 0: `# tests 511`, `# pass 511`, `# fail 0` in 15.4 s. Before this work the count was 466; the environment suites alone were 481 after step 1.
- `node --test src/tests/*.test.ts` in fluxiq-binding passed 6 of 6 (3 engine attempts, 3 binding-only runs).

## Not verified

- **Replay, repair and perturbations.** I did not exercise replay at zero calls, repair after a perturbation, or a perturbed environment through the engine; P8b's done-when needs all three. The native node implementations, the runtime adapter and the host boundary are unit-tested only. An exploring attempt never runs them through the engine.
- **Tasks that return data.** Read-contacts, largest-files, mail-unread and the like were not run through the engine, and there is no generic read node yet. A result's rows must trace to a read (N3), so the binding needs a list-read node that returns rows under a `readRowsKey`.
- **Live models.** No live model ran. Whether a real model writes `{ "handle": "eN" }` targets and declares consequences as instructed is untested.

## Open questions and contradictions found

1. **Acts are keyed by parameters** (`act-record/identity/target-keys.ts`). Android's ids are positions (`n12` is Dark mode on one screen and Bluetooth on the next), so Core refused the second switch tap as a repeat of a landed act. The binding's stable handles fix this. Any future domain whose ids are not identities hits the same wall.
2. **Denied evidence keys cover the whole request packet**, Core's own keys included. Declaring `state` or `snapshot` refused every request (`flow_bootstrap.request_refused_evidence_denied_key`). The binding now declares only `simHiddenState`. Worth a sentence in Core's `deniedEvidenceKeys` doc.
3. **Permission verbs are strict.** The permission declaration's `verb` must match `^[a-z]{2,20}( [a-z]{2,20})?$`. `run_command` threw `verb_invalid`, which Core reported as `tool_failed`. The binding now writes "run command".
4. **Core cannot take a landed class after the fact.** A call's classes come only from what it declares. The binding therefore foresees the class on a scratch copy and refuses an undeclared lasting act.
5. **One environment per instance.** Core holds one native runtime, one host boundary and one evidence binding, so a second registration replaces the first.
6. **Reset is refused.** `replay: "reset"` answers `sim.reset_unsupported`. Restoring a snapshot would be easy, but whether a reset may undo anything at all is P8b's call.
7. **Documents not updated.** This repo's `AGENTS.md` says bindings go "in their own directory per package"; I built one generic package, as the brief asked. `AGENTS.md` and `README.md` are not mine to edit and were left as they are.
