// The recovery ladder's last words name what actually happens next (t428).
// Paid run R4a read "Trying again didn't help: FluxIQ tried the step again and
// it still didn't work, so the test follows what the Flow says to do when this
// step fails." The Flow had no way on from that step's failure, and the test
// simply ended. Real graph runs against the wiring page, no model.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { edge } from "../../lifecycle-run/tests/lifecycle-fixtures.ts";
import { repairer, STOP } from "../../lifecycle-run/tests/in-run-repair-fixtures.ts";
import { withRows } from "../../lifecycle-run/tests/recovery-paths-fixtures.ts";
import { closer, fact, line, page, pageOptions, press } from "../../lifecycle-run/tests/wiring-fixtures.ts";

/** The ladder's last thought for `nodeId`: the row that says why it stopped and what comes next. */
function ladderEnd(rows: readonly ClientGatewayActivity[], nodeId: string): string | undefined {
  const said = rows.filter((row) => row.detail?.kind === "thought" && row.detail.ref === nodeId && row.detail.title !== "Fixing a step");
  return said.at(-1)?.detail?.text;
}

/** s2 refuses every press and may not be tried again. */
const refusing = () => page({ failing: { s2: { retryable: false } } });

async function rowsOf(flow: AutomationStudioFlowDocument, extra: Parameters<typeof pageOptions>[1] = {}) {
  const { result, rows } = await withRows(() => runAutomationStudioGraph(flow, pageOptions(refusing(), extra)));
  return { trace: result, rows };
}

describe("the recovery ladder's end, in a real run", () => {
  it("says the run stops here when the Flow has no way on from the failure and no fix comes", async () => {
    const { trace, rows } = await rowsOf(line("graph.main", [press("s1"), press("s2", "s2", STOP), press("s3")]));

    expect(trace.status).toBe("failed");
    expect(ladderEnd(rows, "s2")).toBe("Another try wouldn't change what happened, so the run stops here at this step.");
  });

  it("says FluxIQ will look at the page and fix the step when an in-run fix will be asked for, before it is", async () => {
    const repair = repairer(() => ({ kind: "none", reason: "no fix" }));
    const { rows } = await rowsOf(line("graph.main", [press("s1"), press("s2", "s2", STOP), press("s3")]), { repairIncident: repair.callback });

    expect(repair.requests).toHaveLength(1);
    expect(ladderEnd(rows, "s2")).toBe("Another try wouldn't change what happened, so FluxIQ will look at the page and fix this step before going on.");
    const thoughts = rows.filter((row) => row.detail?.kind === "thought" && row.detail.ref === "s2").map((row) => row.detail!.title);
    expect(thoughts).toEqual(["Not repeating the step", "Fixing a step"]);
  });

  it("follows the Flow's failed route when the step has one", async () => {
    const flow = line("graph.main", [press("s1"), press("s2", "s2", STOP), press("s3")]);
    const routed = { ...flow, edges: [...flow.edges, edge("s2", "s3", "failed")] };
    const repair = repairer(() => ({ kind: "none", reason: "no fix" }));
    const { trace, rows } = await rowsOf(routed, { repairIncident: repair.callback });

    expect(trace.status).toBe("succeeded");
    expect(repair.requests).toHaveLength(0);
    expect(ladderEnd(rows, "s2")).toBe("Another try wouldn't change what happened, so the run follows what the Flow says to do when this step fails.");
  });

  it("follows the Flow's On Fail handler when one is in scope, and says so before it runs", async () => {
    const handler = closer("h.fail", { event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("cleared")] }, { disposition: "resolve", outputs: { ok: "resolved" } });
    const { trace, rows } = await rowsOf(line("graph.main", [press("s1"), press("s2", "s2", STOP), press("s3")], [handler]));

    expect(trace.status).toBe("succeeded");
    expect(ladderEnd(rows, "s2")).toBe("Another try wouldn't change what happened, so the run follows what the Flow says to do when this step fails.");
    const said = rows.findIndex((row) => row.detail?.kind === "thought" && row.detail.ref === "s2");
    const handlerStep = rows.findIndex((row) => row.step?.nodeId === "h.fail.close");
    expect(said).toBeGreaterThan(-1);
    expect(handlerStep).toBeGreaterThan(said);
  });

  it("says the run carries on past a step the Flow can finish without", async () => {
    const { trace, rows } = await rowsOf(line("graph.main", [press("s1"), press("s2", "s2", { onFailure: "continue" }), press("s3")]));

    expect(trace.status).toBe("succeeded");
    expect(ladderEnd(rows, "s2")).toBe("Another try wouldn't change what happened, so the run carries on past this step, since the Flow can finish without it.");
  });
});
