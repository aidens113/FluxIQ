// The Flow script format, in the words the model is shown.
//
// This is the whole of what a model must learn to build a Flow. It replaced a
// nested JSON schema of router, subflows, nodes, edges, endpoints and keys --
// 2,600 bytes of shape the model had to hold consistent with itself while it
// wrote, and most of the refused builds in the first full campaign failed on
// that shape rather than on the reasoning. Lines cannot be unbalanced, a value
// is never quoted, and nothing is ever escaped, so the failure mode the format
// used to have does not exist.
//
// Kept to one string so the prompt, the completion schema and the refusal
// feedback can never describe the format differently.
//
// Two statements were added after the first four live campaign slices, in
// which not one built Flow contained a step that acted on its target: every
// Flow was "go there, read the whole list", and a task that asked for 14 of
// 280 rows returned 280 and reported success. Neither the format nor the
// validator ever refused an acting step -- a script naming a click, an entry
// and a choice builds and validates today -- so what was missing was the
// statement that one is allowed and, where the instruction asks for part of a
// collection, required. The model had been told the opposite by inference: the
// evidence tools it was offered refuse to act for anything but revealing
// hidden structure, so "I may not do this" was the only reading available to
// it.
//
// The third is about where a key goes. Live builds were refused
// `bootstrap.unknown_parameter` for a bare `fields:`, `paginate:` or
// `location:` line -- words the tool descriptions themselves use -- because
// each belongs inside a parameter rather than beside it.
//
// The fourth is the sentence about handles, and it was learned twice. With the
// statements above in place, the first live build authored exactly the right
// narrowing Flow -- choose, choose, press, read -- and named each control by a
// handle shaped like this example's old ones (`control.7`, `field.2`), which
// the evidence never issued, so all three acting steps were refused
// `web.handle.malformed` (`run-mu6b6lvl-db87c27f`) and the build that followed
// went back to reading everything. Its extraction handle was right, because
// the detection tool spells that shape out.
//
// Replacing the example handles with descriptions of the handle to copy --
// `target: <the handle for the status filter>` -- made it worse: the next
// build wrote the description as the value, and all three steps were refused
// `bootstrap.invalid_parameter_value` (`run-mu6bgyc8-3d355b20`). A model
// copies whatever shape the example shows, so the example must show the right
// shape and the surrounding line must say it is a shape. That is what these
// two now do together.
//
// The fifth is the replay premise, added on 2026-09-21 (P17). The only Flow the
// first end-to-end panel campaign created (E1 lane B, E9) kept none of the
// cookie and notification dismissals its exploration had needed: exploration
// closed both, every page after that showed neither, and the Flow was written
// from those pages. Nothing the model was shown said the Flow would run again
// from the page as it first was, and the evidence policy tells it that what it
// changes while looking is for looking -- so a dismissal read as scaffolding.
// Replayed with no model, the Flow met both overlays. The statement says what
// the replay starts from, and that a change the answer depended on is a step.
//
// The sixth is the consequence declaration, added on 2026-09-22. A step that
// presses something is the one web act whose effect the page decides rather
// than the action -- the same click applies a filter on one page and publishes
// on the next -- so the model is the only party that can say what a step would
// lastingly do, and the permission gate cannot ask a person about a step that
// never said. Two live builds met the refusal that asks for it, wrote exactly
// the right line, and were answered `bootstrap.unknown_parameter` because the
// authoring readers had nowhere to put it (`run-mud7fssy-902f877b`,
// `run-mud7p1wg-3049531f`). The reserved word now exists
// (`../authoring/consequences.ts`), and this is where the model is told it
// does. The classes are interpolated from `action-permissions/` rather than
// spelled here, so a class added there is offered without anyone editing this
// file.
//
// It is stated even though a build ordinarily reaches the gate the other way.
// The model runs the library's nodes and each `run_node` call declares its own
// consequences, so a Flow assembled from the steps that ran carries the
// declaration already. This format is what a nested plan and any script the
// model writes by hand go through, and a step that arrives here undeclared is
// refused -- so the sentence is what makes that refusal answerable.
//
// The routing lines were rewritten on 2026-09-18. The format used to say that
// `step: run subflow <label>` reaches a block, and Core read that as a route
// rule with no condition -- which always holds, so every Flow built with a
// block ran that block and nothing else, whatever the page showed. A block now
// says when it runs with a `when:` line, the router tests those before any
// step runs, and the steps outside every block are what runs when none holds.
// The paths a condition may read, and the values exploration saw for them,
// arrive beside the format under `routing`.
//
// The act-on-one-item example at the end of this file was added on 2026-10-07
// (t339), when candidate mode began showing this text on
// `core.submit_candidate`. Every example in the format navigates, renames,
// narrows or reads, and the Flows the creation lanes need choose options, set
// a quantity and press a control that changes something. Its press declares
// `modify_existing`, not `none`: adding to a basket changes it, and an example
// that called a lasting press harmless would teach exactly the
// under-declaration four live builds already showed. It is a second constant,
// not more lines of the format, so the legacy completion schema -- which
// carries the format and is held under a byte ratchet -- does not change while
// legacy is the default and the baseline candidate mode is measured against.
//
// The choice and optional statements ahead of that example were added on
// 2026-10-07 (t357), from lane A rounds 2-4 (t342). Every candidate script
// pressed the Space Grey swatch, which the page arrives with already chosen,
// so the press un-chose it (round 2's toggle trap): the only example of a
// choice was a dropdown, and nothing said a press toggles. So a choice is now
// taught as the state it leaves, with the nodes that set a state rather than
// flip it (`web.dom.check`, `web.dom.select`), and the press kept for a plain
// button the page arrives with unchosen. Since t364 (round 5) `web.dom.check`
// also sets an option the page draws itself by the chosen state it shows -- the
// Space Grey `<div>` swatch -- so the guidance points at the swatch, not at a
// hidden box behind it, which round 5's model spent eight decisions seeking.
// And no script could say a step was
// only sometimes needed -- a consent banner or popup that may not show --
// although the runtime already skips an absent step of that kind; the
// `optional: yes` line now says it (`../authoring/assemble.ts`). Both live in
// the same candidate-only constant, because that is what candidate mode shows
// (`../candidate/authoring-loop.ts`) and the legacy schema must not change.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";

export const AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT = [
  "Write the Flow as plain lines, not JSON. One fact per line, `key: value`.",
  "The first colon ends the key and the rest of the line is the value exactly as written, so a value may contain colons, quotes or braces and nothing is ever escaped.",
  "Blank lines and indentation mean nothing. Keys are matched ignoring case, spaces, `-` and `_`.",
  "`flow: <what the Flow does>` once, at the top.",
  "`step: <what this step does>` starts a step. Write `step <label>: <what it does>` when another line needs to point at this step; the label is a name you invent.",
  "`node: <an id or label from nodeCatalog>` chooses the node for the step.",
  "Every other line in a step sets one of that node's parameters by its id, `url: https://example.test/a`. Reach inside a structured parameter with a dotted key, `extractList.fields.name: product-name`. A list is comma separated. Leave a parameter out and its default is used.",
  "A key a parameter takes is written inside it: `extractList.minItems: 0`, `target.location: https://shop.test/members`.",
  "A step may act, not only read: choose an option, enter text, set a control, press one. The tools you were given while gathering evidence are for looking; one refusing to act, or not existing, says nothing about what the Flow may contain.",
  `A step that presses something says what pressing it would lastingly do: \`consequences: <classes>\`, from ${AUTOMATION_STUDIO_ACTION_CONSEQUENCES.join(", ")}, comma separated; \`consequences: none\` when it only reveals, opens, expands, filters, sorts, ticks, dismisses or navigates. Every press needs the line, and it says what that one press would cause, not what the Flow is for: the press that applies a filter is none, the press that publishes is send_or_publish. A step that types, chooses, waits or reads never needs it.`,
  "The Flow runs later on its own, with no model, from the page the run starts on, and nothing you did while gathering evidence is still in effect then: a notice you closed, a consent you answered, a search you ran and a filter you chose are all as they were before you touched them. So every change the answer depended on is a step, in the order you made it, including closing a notice, prompt or banner that stood in front of a control. Arriving at an address changes nothing else: whatever that page puts in front of its content on arrival is still there.",
  "When the instruction asks for part of a collection -- a count, a range, a status -- narrow it first with the steps that set the target's own controls, then read what is left. Returning everything is a wrong answer. Where the answer may be no rows, write `extractList.minItems: 0`.",
  "Steps run and connect in the order written: never write ids, versions, keys or edges.",
  "`on <port>: go to <label>` sends one of the node's other output ports to a named step instead of to the next one. Use a port the node's catalog entry lists, and never the step written next.",
  "When the run can start in different situations that need different steps -- the instruction says so, or routing.situations shows it -- give each such situation a block: `subflow <label>: <the situation>`, then `when: <condition>`, then its steps, then `end`. The steps outside every block are what runs when no block's condition holds.",
  "The router checks the blocks in the order written, before any step runs, and runs only the first whose `when:` holds; nothing else runs. So a block holds every step its situation needs, including the ones it shares with the others.",
  "A condition is `<path> <test> [value]`, for example `when: state.page.dialog exists` or `when: inputs.mode is retry`. The path is one listed in routing.paths; the test is exists, is missing, is, is not, contains, does not contain, matches, starts with, greater than, less than, is true or is false. Two `when:` lines must both hold.",
  "One situation needs no block and no `when:`: write its steps and nothing else.",
  "A line with no `key:` continues the value above it on a new line.",
  "Where a step names something you observed, its value is the handle the evidence printed for it, copied exactly. The handles in the examples below are the shape, not the value: read the real one out of the evidence, and never invent one, describe one, or reuse one from an example.",
  "Example:",
  "flow: Rename a member",
  "step: open the members page",
  "  node: web.browser.navigate",
  "  url: https://shop.test/members",
  "step row: click the member's row",
  "  node: web.dom.click",
  "  target: t7",
  "  consequences: none",
  "  on failed: go to shout",
  "step: type the new name",
  "  node: web.dom.type",
  "  target: t2",
  "  text: Ada Lovelace",
  "step shout: check the page said why",
  "  node: web.dom.wait_for_text",
  "  text: could not be renamed",
  "Example, narrowing before reading:",
  "flow: Orders awaiting dispatch",
  "step: open the orders page",
  "  node: web.browser.navigate",
  "  url: https://shop.test/orders",
  "step: filter to awaiting dispatch",
  "  node: web.dom.select",
  "  target: t4",
  "  value: awaiting-dispatch",
  "step: apply it",
  "  node: web.dom.click",
  "  target: t5",
  "  consequences: none",
  "step: read what is left",
  "  node: web.dom.extract_list",
  "  extractList: extraction.1",
  "  extractList.minItems: 0",
  "Example, two situations the run can start in:",
  "flow: Export this week's orders",
  "subflow notice: a notice stands in front of the orders",
  "  when: state.page.dialog exists",
  "  step: close the notice",
  "    node: web.dom.click",
  "    target: t9",
  "    consequences: none",
  "  step: read the orders",
  "    node: web.dom.extract_list",
  "    extractList: extraction.1",
  "end",
  "step: read the orders",
  "  node: web.dom.extract_list",
  "  extractList: extraction.1"
].join("\n");

/**
 * How a candidate sets a choice and marks a step only sometimes needed, then
 * the act-on-one-item example, shown after the format wherever candidate mode
 * shows it (`../candidate/authoring-loop.ts`). Kept beside the format rather
 * than in it, so the legacy completion schema the default build sends stays
 * byte for byte what the live baseline ran with.
 *
 * Every line of the example is the grammar `../authoring/parse.ts` reads, and
 * its optional step assembles into the optional shape the runtime skips when
 * the banner is absent (`../authoring/assemble.ts`).
 */
export const AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE = [
  "A choice is written as the state it leaves, not as a press. A press toggles: pressing an option the page already shows chosen un-chooses it.",
  "An option in a dropdown is `node: web.dom.select` with the option's `value:`. A checkbox, a radio, or an option the page draws itself and shows chosen -- a colour swatch or size chip drawn apart from the others (`marked`), a `selected` tab, a `pressed` toggle -- is `node: web.dom.check` on that control itself, `checked: true` to choose it or `checked: false` to clear it; it presses only when the state differs, so it is right however the page arrives. Never look for a hidden box behind a swatch or chip: check the swatch or chip itself.",
  "Every option the instruction asks for gets its own step, even one the page arrives with already chosen: write it with `web.dom.check` or `web.dom.select`, which change nothing when the state is already right, so the Flow is right however a later run's page arrives. Press an option with `node: web.dom.click` only when the page shows no chosen state for it at all; `web.dom.check` refuses such a control and says so. A press is right for a control that does something each time it is pressed: apply, add, send, open, next.",
  "`optional: yes` marks a step that is only sometimes needed -- closing a cookie banner, a popup or a notice the page may not show -- and the run goes on past it when it cannot be done. Use it only on such a step, never on one the answer depends on, never inside a repeat and never beside an `on <port>:` line.",
  "Example, acting on one item:",
  "flow: Put two medium blue shirts in the basket",
  "step: open the shirt's page",
  "  node: web.browser.navigate",
  "  url: https://shop.test/shirts/oxford",
  "step: close the cookie banner if it shows",
  "  node: web.dom.click",
  "  target: t2",
  "  consequences: none",
  "  optional: yes",
  "step: choose the colour swatch",
  "  node: web.dom.check",
  "  target: t3",
  "  checked: true",
  "step: choose the size",
  "  node: web.dom.select",
  "  target: t6",
  "  value: M",
  "step: set the quantity",
  "  node: web.dom.type",
  "  target: t8",
  "  text: 2",
  "step: add it to the basket",
  "  node: web.dom.click",
  "  target: t11",
  "  consequences: modify_existing",
  "step: check the basket took it",
  "  node: web.dom.wait_for_text",
  "  text: added to your basket"
].join("\n");

/**
 * How a candidate repeats a span and binds a value, with an example of each
 * loop (t346): reading every page of a list and processing the rows at the end
 * of the run (lane C's shape), and acting on each row a listing kept (lane
 * D's). Candidate-only, beside the act example and for the same reason: the
 * legacy completion schema carries `AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT` and
 * stays byte for byte what the baseline ran with.
 *
 * Every line is the grammar `../authoring/parse.ts` reads and every loop the
 * one a drafted repeat becomes (`../authoring/draft-routing.ts`), so the
 * examples build the graph shape the legacy path builds for the same loop.
 */
export const AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT = [
  "Repetitive work is a loop, never the same steps written again. A step starts a span that repeats with lines beside its node:",
  "`repeat over: <label>` runs the span once for each row the labelled listing step read. The listing is written before the span and runs once; it never repeats itself. A step inside the span that presses a row's control finds that row's own control on each pass.",
  "`repeat through: <label>` names the span's last step; without it the span is the step that says repeat, alone.",
  "`repeat while: <label>` runs the span from this step through the labelled step, then again while that step succeeds. The loop ends when that step answers ended -- a next-page step does when there is no further page -- or after `repeat most: <passes>`; a last step that cannot answer ended needs repeat most.",
  "A span holds no `on <port>:` line and no second repeat, and no branch goes into it.",
  "A value that changes between rows or runs is bound, never typed in: `$row.<field>` is a field the listing reads, of the row the pass is on, and only inside a repeat over that listing; `$input.<name> = <value>` is a Flow input, written with the value the person gave; `$step.<label>.<output>` is an output of an earlier step, by its label.",
  "Rows a Flow reads are collected over the whole run; what is done with them at the end -- keep some, drop repeats, sort, limit -- is `recordOutput.process` on the reading step, over the columns `recordOutput.columns` saves.",
  "Example, reading every page of a list:",
  "flow: Earbuds under 50 on every page of the results",
  "step: open the results",
  "  node: web.browser.navigate",
  "  url: https://shop.test/search?q=earbuds",
  "step page: read this page",
  "  node: web.dom.extract_list",
  "  extractList: extraction.1",
  "  extractList.minItems: 0",
  "  recordOutput.columns: [\"name\", \"price\"]",
  "  recordOutput.process: {\"where\": [{\"field\": \"price\", \"lessThan\": 50}]}",
  "  repeat while: next",
  "step next: go to the next page",
  "  node: web.dom.next_page",
  "  nextPage: extraction.1",
  "  consequences: none",
  "Example, acting on each row a listing kept:",
  "flow: Confirm every friend request from a colleague",
  "step: open the requests",
  "  node: web.browser.navigate",
  "  url: https://social.test/friends/requests",
  "step requests: list the requests from colleagues",
  "  node: web.dom.extract_list",
  "  extractList: extraction.2",
  "  extractList.minItems: 0",
  "step: confirm the request",
  "  node: web.dom.click",
  "  target: t21",
  "  consequences: modify_existing",
  "  repeat over: requests",
  "  repeat through: confirmed",
  "step confirmed: check it was confirmed",
  "  node: web.dom.wait_for_text",
  "  text: $row.name"
].join("\n");
