// No new module cycle.
//
// Why. Twice on 2026-10-07 a module cycle made exports arrive `undefined`
// under the test loader. In t351 a candidate re-export from the flow-bootstrap
// barrel gave `runtime/llm` a second way into its cycle, and six tests in four
// files failed with "is not a function". In t358 the handle constants that
// `harness-options/plan-node-handles.ts` read through `llm/harness.ts` were
// `undefined` whenever `bootstrap-completion.ts` loaded first, so the handle
// check accepted any token. Both type-checked cleanly. In a cycle, a module
// that loads while another member is still evaluating sees that member's
// exports half-made: `export *` copies only what is defined so far, a
// `const` read at module-evaluation time is `undefined` or throws, and which
// module is first depends on who imported the cycle. An importBoundaries entry
// in config.mjs guards one named edge; a cycle can close anywhere.
//
// What is measured. The evaluation-order graph (../import-graph/): every
// static import and re-export of every audited script, barrels included,
// except `import type` and `export type`, which are erased. Its strongly
// connected components are the cycles. For each module in one, the finding
// counts its imports that stay inside its cycle -- the edges that close a loop
// -- keyed by the module and ratcheted. So a module that joins a cycle has no
// entry and fails; a module already in one that adds another import leading
// back grows past its entry and fails; and two cycles joined by a new edge
// grow their members' counts and fail. Breaking an edge lowers an entry.
// Each message prints the shortest loop each counted import closes.
//
// The remedy is nearly always the same: import what you need from the module
// that owns it, not from a barrel -- an `index.ts`, or a file that re-exports
// one, such as `llm/harness.ts` -- whose own imports lead back to you. The
// imports rule does not count a reach past a barrel that leads back to the
// importer, so the owner's import is never traded for a barrel finding.

import { buildRuntimeGraph, cycleComponents, shortestLoop } from "../import-graph/index.mjs";

export const id = "import-cycles";
export const title = "No module joins an import cycle, and no cycle gains an import that closes a loop";

const LOOPS_SHOWN = 3;

export function run(ctx) {
  const edges = buildRuntimeGraph(ctx);
  const findings = [];

  for (const component of cycleComponents(edges)) {
    const members = new Set(component);
    for (const file of component) {
      const closing = (edges.get(file) ?? []).filter((edge) => members.has(edge.target));
      if (closing.length === 0) continue;
      const loops = closing.slice(0, LOOPS_SHOWN).map((edge) => {
        const loop = shortestLoop(edges, members, file, edge.target);
        return `line ${edge.line} "${edge.text}":\n      ${loop.join("\n      -> ")}`;
      });
      const more = closing.length > LOOPS_SHOWN ? `\n    ...and ${closing.length - LOOPS_SHOWN} more.` : "";
      findings.push({
        key: file, value: closing.length, limit: 0, path: file, line: closing[0].line,
        message: `${file}: ${closing.length} import(s) lead back to this module, a module cycle of ${component.length} module(s). Inside a cycle a module can load while another is still evaluating and read its exports as undefined. Loops closed:\n    ${loops.join("\n    ")}${more}\n  Break the loop: import from the module that owns what you need, not a barrel (an index, or a file that re-exports one) whose imports lead back here; make the import \`import type\` if only types cross; or move the shared value into a module that imports neither side.`,
        severity: "fail", ratchet: true
      });
    }
  }

  return findings;
}
