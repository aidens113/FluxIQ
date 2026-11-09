# Simulated Android environment (Wave 1)

Package: `C:/Users/osrs_/FluxStuff/!FluxIQTestEnvironments/packages/android` (only this directory changed). It exports `androidPackage: SimEnvironmentPackage<AndroidState>` (and `createAndroidEnv`) from `src/index.ts`. Not committed.

## Outcome

Done. Acceptance, both run from the repo root:

- `pnpm --filter @fluxiq-test-env/android typecheck` -> `tsc -p tsconfig.json`, no output, exit 0.
- `node --test "packages/android/src/**/tests/*.test.ts"` -> `# tests 98 # pass 98 # fail 0`.

## What exists

- **Device state** (`src/state`): launcher, installed apps (five simulated, Camera and Clock as toast-only stubs), foreground app and per-app back stacks, recents, status bar (clock from the simulated time, Wi-Fi, Bluetooth, battery, notification count), notifications and a shade, a swipe-to-dismiss and tap-to-open path, granted and denied runtime permissions, simulated clock, selection, focus and scroll offsets. Seeded by `createRng`; fixed names (Priya Nair, Tomas Weber, Lucy Park, group Work) exist for every seed, the rest varies.
- **Apps** (`src/apps`): Contacts (list, groups, group, detail, new contact, delete), Messages (threads, thread, compose, send), Settings (Wi-Fi, Bluetooth, Display dark mode, Apps > per-app permission switches), Shop (search, results, product, cart, checkout with two saved cards, confirmation), Notes (list, editor, long-press multi-select, delete one or many).
- **Observations** (`src/ui`, `src/runtime/render.ts`): view tree of windows (status bar, app or launcher, shade or recents, dialog). Each node has `resource-id` (`pkg:id/name`), `content-desc`, `class`, `bounds` "[x1,y1][x2,y2]" inside 1080x2400, and clickable, scrollable and enabled flags. Roles come from Android classes (Button to button, EditText to text-field, Switch to switch, RecyclerView to list, Toolbar, AlertDialog to dialog, and so on; list-item and menu-item are explicit overrides). Lists show only their visible window (4 to 6 rows) and scroll three rows at a time. A text field's name is its hint and its value is what was typed.
- **Actions**: tap, long_press, type (appends), clear, scroll, swipe, press_key (back, home, recents, enter), open_app, wait. Each act takes 300 ms of simulated time; a refused act takes none and keeps the last observation valid. Node ids are sequential in tree order, so a seed gives the same ids. A target id is valid only for the latest observation (stale ids are refused with `target_not_found`).
- **Permission dialog**: first use of Contacts (at launch), Shop (at launch, notifications) and Messages (at the first send, which completes after Allow) shows a runtime dialog; Don't allow leaves Contacts empty and Messages unable to send.
- **Act classes** in the log: send message = `send`, place order = `money`, delete note or contact = `delete`, save note or contact and every Settings switch (including app permissions) = `change`. Dialog Allow or Don't allow lands nothing.

## Tasks (6, `src/tasks`)

| id | kind | scope | typed outputs |
| --- | --- | --- | --- |
| contacts-group-mobile-numbers | read, scroll the group list, open each contact | none | array of {name, phone} |
| settings-dark-mode-on-bluetooth-off | settings change | change (max 2) | none |
| messages-send-to-contact | send | send (max 1) | none |
| contact-number-to-note | cross-app: read Contacts, write Notes | change (max 1) | {phone} |
| shop-order-with-saved-card | money | money (max 1) | {orderNumber, total} |
| notes-delete-empty-drafts | bulk delete with a precise rule (title starts with Draft AND body empty; decoys have either) | delete (max = matches) | {deleted} |

Honest paths use only `observe` and `act` through `src/driver` (find by role and name, `settle` answers permission dialogs and notices and waits out spinners, apps are reopened from their start). Oracles judge the change from the before-state, check the data outside the task's keys is untouched, check act classes against scope and per-class maxima, and validate outputs against the schema.

## Perturbations (5)

send-in-overflow (Send removed, Submit in the More options menu), renamed-controls (Add to cart/bag, Checkout/Go to checkout, Place order/Pay now, Dark mode/theme), slow-list (2.5 s spinner on every list), reordered-lists (all lists reversed), popup-after-time (Storage almost full dialog 1.5 s after it is applied, once, blocks the screen until OK).

## Tests (98, in `src/tasks/tests/tasks.test.ts` 76 and `src/runtime/tests/env.test.ts` 22)

- Honest path passes its oracle: 6 tasks x seeds 1 and 2.
- Perturbations: every task passes under every perturbation (6 x 5), and under all five together (seed 2). All tasks are meant to survive all five (honest paths use the aliases and the overflow fallback); a runtime test proves the popup, spinner and overflow detour really happened during the run.
- Wrong results: read task fails on a wrong number, missing contact, wrong order, extra field, text, nothing; the other five fail on a wrong attempt (wrong recipient text, wrong note title, wrong card, wrong notes deleted, settings untouched), and on wrong or missing outputs where they return data.
- Out of scope: for each task, a real extra act of every class outside its scope (change, send, money, delete) lands and fails the oracle.
- Done twice: settings (toggled again), send, note, order (honest path repeated), bulk delete (second delete act) each fail. The read task has no lasting act.
- Determinism: same seed, identical observations and log; different seeds differ; snapshot/restore round-trips.
- Runtime: bounds and ids, roles, permission dialog and its blocking, windowed lists, stale ids, back stack and recents, shade, act classes, events shown once, popup timing, disabled controls, typing, enter.

## Gaps and notes

- Contract: no change needed. Two small observations: `ViewNode.attributes` is a string map, so booleans are strings; the contract gives no way for an environment to declare which perturbations a task survives, so tests state it (all of them).
- Bulk delete is one act that lands `delete` once, so "done twice" is tested as a second delete act on another note; the maxima in the oracle (matches count) also allow one-by-one deleting.
- Not simulated: real keyboard, rotation, multi-window, app install or uninstall, Contacts edit of an existing contact, incoming messages over time, battery change. Nothing in the P8 FluxIQ binding exists yet.
- The task contacts and Tomas thread are fixed names; seeds change numbers, filler contacts, thread and note order, products' small price offsets, and Wi-Fi.
- Tests need only Node type stripping (no build step). A `ui` and `data` barrel exist; `src/driver` and `src/tasks/harness.ts` ship as source (test support).
