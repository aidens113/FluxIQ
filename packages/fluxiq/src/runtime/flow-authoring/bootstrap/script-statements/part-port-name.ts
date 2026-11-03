// The one rule for a part's input and output names (t741 B1): letters and
// digits, a lower-case letter first, at most 32 (a Flow input's rule,
// `flow-draft`), and never `item`, the name a loop's row takes, which a part's
// steps would read in place of the value it was given.
//
// Asked of both sides alike by a script's part (`./called-parts.ts`) and by the
// supervisor's plan (`../../project-agents/supervisor/plan-input.ts`). They used
// to hold the rule apart: the plan took `item`, the script refused it, and the
// subflow's scope demanded the plan's names, so a plan naming a port `item` was
// unbuildable (office `run-mvgo5xft-25460ba2`, steps 0057-0067).

const PORT_NAME = /^[a-z][A-Za-z0-9]{0,31}$/u;
const ROW_NAME = "item";

/** Whether a part's input or output may be named `name`. */
export function automationStudioFlowScriptPartPortName(name: string): boolean {
  return PORT_NAME.test(name) && name !== ROW_NAME;
}
