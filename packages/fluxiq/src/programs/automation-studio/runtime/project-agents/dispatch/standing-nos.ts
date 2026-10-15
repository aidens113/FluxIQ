import type { AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";

// The standing nos one build's subflow trials kept, carried across the briefs
// of a subflow (t634). A8 wave 8 `project` towels: brief 1's trials upheld a
// no calling a stored row not the kind of thing asked for, and repair brief 2,
// a builder loop with a gate of its own, started without it, so its gate
// weighed a no asking to bring that row back as if fresh. Each brief's gate
// tells its port of a no it let stand, with Core's record of it
// (`standingNo`, `../../result-verification/standing-no/`); the dispatcher
// keeps those here for the build (`./run-brief.ts`, `STANDING`), and hands a
// later brief of the same subflow, under the same plan, the ones before it
// (`./trial-port.ts`), which seed its gate's memory
// (`../../flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`).
//
// Only a no that upheld rows of a kind is kept, as the gate's memory keeps
// only those; the records are Core's, never shown to a model, and the gate
// validates each one's shape again before it weighs anything by it. A plan
// that changed is another question about the subflow, so its records are not
// carried into it: Core refutes only what it measured.

/** The most records one subflow keeps under one plan, as one gate's memory keeps: the latest. */
const MAX_KEPT = 20;

type Scope = Pick<AutomationStudioSubflowScope, "subflowKey" | "planDigest">;

const key = (scope: Scope): string => JSON.stringify([scope.subflowKey, scope.planDigest]);

export class AutomationStudioProjectDispatchStandingNos {
  private readonly kept = new Map<string, unknown[]>();

  /** The standing nos the briefs of `scope`'s subflow kept under its plan so far, oldest first, as copies. */
  earlier(scope: Scope): unknown[] {
    return structuredClone(this.kept.get(key(scope)) ?? []);
  }

  /** A brief of `scope`'s subflow let `standingNo` stand; kept only where it upheld rows of a kind (header). */
  stood(scope: Scope, standingNo: unknown): void {
    if (!upheldRows(standingNo)) return;
    const at = key(scope);
    const records = this.kept.get(at) ?? [];
    records.push(structuredClone(standingNo));
    while (records.length > MAX_KEPT) records.shift();
    this.kept.set(at, records);
  }
}

function upheldRows(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const upheld = (value as { upheldKind?: unknown }).upheldKind;
  return Array.isArray(upheld) && upheld.length > 0;
}
