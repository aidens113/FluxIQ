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
// The routing lines were rewritten on 2026-09-18. The format used to say that
// `step: run subflow <label>` reaches a block, and Core read that as a route
// rule with no condition -- which always holds, so every Flow built with a
// block ran that block and nothing else, whatever the page showed. A block now
// says when it runs with a `when:` line, the router tests those before any
// step runs, and the steps outside every block are what runs when none holds.
// The paths a condition may read, and the values exploration saw for them,
// arrive beside the format under `routing`.

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
  "  target: target.7",
  "  on failed: go to shout",
  "step: type the new name",
  "  node: web.dom.type",
  "  target: target.2",
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
  "  target: target.4",
  "  value: awaiting-dispatch",
  "step: apply it",
  "  node: web.dom.click",
  "  target: target.5",
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
  "    target: target.9",
  "  step: read the orders",
  "    node: web.dom.extract_list",
  "    extractList: extraction.1",
  "end",
  "step: read the orders",
  "  node: web.dom.extract_list",
  "  extractList: extraction.1"
].join("\n");
