// The composed seam of the candidate submission controller (`submitComposed`):
// a whole Flow Core assembled from proposals it had already accepted, checked
// as a plan without the reply reader (which keeps no part interface) and
// without element resolution (every element was resolved when its proposal
// was accepted).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "../index.ts";
import { refusalTestSubmission } from "./refusal-domain-fixture.ts";

/** A Flow whose router-run subflow calls one part that hands back what it read, as a builder's script would write it. */
const SCRIPT = [
  "flow: Find the titles",
  "step first: run reader",
  "  call: reader",
  "  author: $input.author = Ada Hart",
  "end",
  "end",
  "part reader: read the titles",
  "  input: author",
  "  output: titles = $step.rows.records",
  "  step rows: read the rows",
  "    node: web.dom.extract_list",
  "    extractList: extraction.1",
  "    extractList.minItems: 0",
  "end"
].join("\n");

function controller() {
  return new AutomationStudioFlowCandidateSubmissionController(refusalTestSubmission());
}

/** The plan a submission of the script resolves to: every element resolved by the domain, as an accepted proposal's are. */
async function resolvedPlan(): Promise<AutomationStudioFlowBootstrapPlan> {
  const submitted = await controller().submit({ flow: SCRIPT });
  if (!submitted.ok) throw new Error(JSON.stringify(submitted.check.feedback));
  return structuredClone(submitted.candidate.buildPlan.plan);
}

describe("a composed candidate", () => {
  it("becomes a revision with its parts' interfaces and success checks kept, on the counter submit uses", async () => {
    const plan = await resolvedPlan();
    const reader = plan.subflows.find((subflow) => subflow.key === "reader")!;
    // A success check on a resolved element: a model may never write one so, a composed Flow carries it as its builder's domain resolved it.
    reader.metadata = { ...reader.metadata, "fluxiq.successCheck": [{ fact: "text", op: "contains", value: "Hart", target: { selector: "#t8" } }] };
    const composer = controller();
    const composed = await composer.submitComposed({ plan, summary: "Find the titles" });
    expect(composed.ok, JSON.stringify(composed)).toBe(true);
    if (!composed.ok) return;
    expect(composed.candidate.revision).toBe(1);
    expect(composed.candidate.digest).toMatch(/^[a-f0-9]{64}$/u);
    const kept = composed.candidate.buildPlan.plan.subflows.find((subflow) => subflow.key === "reader")!;
    expect(kept.interface?.inputs.map((port) => port.id)).toEqual(["author"]);
    expect(kept.interface?.outputs.map((port) => port.id)).toEqual(["titles"]);
    expect(kept.metadata?.["fluxiq.successCheck"]).toEqual([{ fact: "text", op: "contains", value: "Hart", target: { selector: "#t8" } }]);
    expect(composer.matches({ revision: 1, digest: composed.candidate.digest, baseDependencyDigest: "accepted.base" })).toBe(true);
    const next = await composer.submit({ flow: SCRIPT });
    expect(next.ok && next.candidate.revision).toBe(2);
  });

  it("is refused as unchanged when the same Flow is composed again, and the revision stands", async () => {
    const plan = await resolvedPlan();
    const composer = controller();
    const first = await composer.submitComposed({ plan, summary: "Find the titles" });
    const again = await composer.submitComposed({ plan, summary: "Find the titles again" });
    expect(first.ok).toBe(true);
    expect(again.ok).toBe(false);
    expect(composer.latest()?.revision).toBe(1);
  });

  it("refuses a composed Flow that still names a handle, rather than resolving it as a model's", async () => {
    const plan = await resolvedPlan();
    const reader = plan.subflows.find((subflow) => subflow.key === "reader")!;
    reader.nodes[0]!.parameters = { ...reader.nodes[0]!.parameters, extractList: { handle: "extraction.1" } as JsonObject };
    const refused = await controller().submitComposed({ plan, summary: "Find the titles" });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.check.issueCodes).toEqual(["candidate.composed_handle_unresolved"]);
    expect(refused.check.feedback.code).toBe("candidate.composed_refused");
  });

  it("refuses a composed Flow the plan's validation refuses, every issue by its path", async () => {
    const plan = await resolvedPlan();
    const main = plan.subflows.find((subflow) => subflow.key === "main")!;
    main.nodes[0]!.parameters = { ...main.nodes[0]!.parameters, subflowId: "missing_part" };
    const refused = await controller().submitComposed({ plan, summary: "Find the titles" });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.check.issueCodes.length).toBeGreaterThan(0);
    expect(refused.check.feedback.code).toBe("candidate.composed_refused");
    expect(JSON.stringify(refused.check.feedback.issues)).toContain("plan.subflows");
  });
});
