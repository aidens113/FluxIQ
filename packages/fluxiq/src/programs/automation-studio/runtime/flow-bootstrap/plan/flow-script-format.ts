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

export const AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT = [
  "Write the Flow as plain lines, not JSON. One fact per line, `key: value`.",
  "The first colon ends the key and the rest of the line is the value exactly as written, so a value may contain colons, quotes or braces and nothing is ever escaped.",
  "Blank lines and indentation mean nothing. Keys are matched ignoring case, spaces, `-` and `_`.",
  "`flow: <what the Flow does>` once, at the top.",
  "`step: <what this step does>` starts a step. Write `step <label>: <what it does>` when another line needs to point at this step; the label is a name you invent.",
  "`node: <an id or label from nodeCatalog>` chooses the node for the step.",
  "Every other line in a step sets one of that node's parameters by its id, `url: https://example.test/a`. Reach inside a structured parameter with a dotted key, `extractList.fields.name: product-name`. A list is comma separated. Leave a parameter out and its default is used.",
  "Steps run and connect in the order written: never write ids, versions, keys or edges.",
  "`on <port>: go to <label>` sends one of the node's other output ports to a named step instead of to the next one. Use a port the node's catalog entry lists.",
  "`subflow <label>:` starts a named block of steps and `end` closes it; `step: run subflow <label>` reaches that block.",
  "A line with no `key:` continues the value above it on a new line.",
  "Example:",
  "flow: Rename a member",
  "step: open the members page",
  "  node: web.browser.navigate",
  "  url: https://shop.test/members",
  "step row: click the member's row",
  "  node: web.dom.click",
  "  target: control.7",
  "  on failed: go to shout",
  "step: type the new name",
  "  node: web.dom.type",
  "  target: field.2",
  "  text: Ada Lovelace",
  "step shout: check the page said why",
  "  node: web.dom.wait_for_text",
  "  text: could not be renamed"
].join("\n");
