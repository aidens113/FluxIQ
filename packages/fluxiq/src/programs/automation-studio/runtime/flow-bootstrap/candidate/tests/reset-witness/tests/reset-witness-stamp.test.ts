// A lasting step's reset witness through the candidate seams (t751, R3 door 2).
//
// The stamp Core's one admission gives a reversible lasting step at submission
// is part of what the Flow does: a trial's act takes it, and a trial of a step
// without one runs with that gap said (t791 fix 4; t751 R3 refused it unrun).
// So the same script text resubmitted after the build
// explored the step's control -- now stamped -- is a new revision, not
// `candidate.unchanged_submission`; a whole candidate Core composed from
// accepted proposals keeps every node's stamp; and a trial port's act keeps
// its step's stamp when it is a valid one.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../../../nodes/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../../../llm/harness-options/index.ts";
import type { AutomationStudioSiteResetWitnessStamp } from "../../../../reset-admission/index.ts";
import { AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate, automationStudioCandidateTrialActs, type AutomationStudioCandidateTrialPort, type AutomationStudioCandidateTrialRequest } from "../../../index.ts";
import { AutomationStudioSiteResetProjectLedger, automationStudioSiteResetProjectReset } from "../../../../site-reset/index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };

it("runs an unwitnessed lasting trial, its answer and its judge's packet saying the gap, and its part unproven (t791 fix 4)", async () => {
  const { submissions } = controller();
  const submitted = await submissions.submit(script("modify_existing"));
  expect(submitted.ok).toBe(true);
  if (!submitted.ok) return;
  const prepare = vi.fn(async () => "reset" as const);
  const read: { siteChange?: unknown } = {};
  const run: AutomationStudioCandidateTrialPort = Object.assign(vi.fn(async (request: AutomationStudioCandidateTrialRequest) => {
    // The port reads the change after its end view, as `service/candidate-trial/run.ts` does.
    read.siteChange = (await request.siteChange?.([{ step: 1, definitionId: "domain.demo.press", outcome: "changed" }]))?.siteChange;
    return { revision: submitted.candidate.revision, digest: submitted.candidate.digest, verdict: "yes" as const, feedback: {} };
  }), { prepareStart: prepare });
  const project = new AutomationStudioSiteResetProjectLedger();
  const compare = vi.fn(async () => ({ moved: false }));
  const gate = new AutomationStudioFlowCandidateTrialGate({
    latest: () => submitted.candidate, trial: { candidateId: "candidate.test", port: run }, reset: automationStudioSiteResetProjectReset({ project, checks: () => ({ compare }) }),
    changeParts: () => ({ parts: [{ id: "p1", effect: { kind: "end_state", state: "the item is saved" } }], partsOf: () => ["p1"] })
  });
  const result = await gate.test({ revision: submitted.candidate.revision, digest: submitted.candidate.digest });
  expect(result.resultCode).toBe("candidate.trial_yes");
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.evidence).toMatchObject({ ok: true, verdict: "yes", unwitnessed: { steps: [{ step: 1, label: "save the item" }] } });
  expect(String(((result.evidence as JsonObject).unwitnessed as JsonObject).instruction)).toContain("judged by its end view and each step's done-when check");
  expect(read.siteChange).toMatchObject({ witnesses: [], proofs: [{ part: "p1", proof: "unproven", steps: [1] }], unwitnessed: { steps: [{ label: "save the item", ranAs: [1] }], parts: ["p1"] } });
});

it("says a step with no witness as advice beside the accepted revision, by label (t791 fix 2)", async () => {
  const gaps = new Map<string, { canMeet: "another_page" | "no_call"; instruction: string }>();
  const resolvePlanNodeParameters: Resolver = async ({ permission, declaredConsequences }) => {
    if (declaredConsequences?.length) await permission({ consequences: [...declaredConsequences], control: { name: "Save", place: "c:save", state: "s:off" }, verb: "press" });
    return { status: "unchanged" };
  };
  // A check that notes the gap its step door found, as the build's permission wrapper does (`planStep`).
  const permissionFor = Object.assign(({ ref, witnessed }: { definitionId: string; ref: string; witnessed?: (stamp: AutomationStudioSiteResetWitnessStamp | undefined) => void }) => async () => {
    witnessed?.(undefined);
    gaps.set(ref, { canMeet: "no_call", instruction: "No call in the tab this step acts in can give Core a place that shows its change." });
    return { permitted: true as const };
  }, { gaps: () => gaps });
  const submissions = new AutomationStudioFlowCandidateSubmissionController({ projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding: { resolvePlanNodeParameters }, permissionFor });
  const accepted = await submissions.submit(script("modify_existing"));
  expect(accepted.ok, JSON.stringify(accepted)).toBe(true);
  expect(accepted.ok && accepted.advice).toEqual(["The step \"save the item\" (plan step 1) changes something on the site and has no place named that shows its change. No call in the tab this step acts in can give Core a place that shows its change."]);
});

/** One press, declared as `consequences`; none declared when absent. */
function script(consequences?: string): JsonObject {
  return { summary: "Save", flow: ["flow: Save the item", "step: save the item", "  node: domain.demo.press", "  text: save", ...(consequences ? [`  consequences: ${consequences}`] : [])].join("\n") };
}

/**
 * A controller whose domain puts every lasting step to its check, and whose
 * check is told the stamp `admission.stamp` holds at that moment: the build's
 * site reset as it stands when the script is submitted.
 */
function controller() {
  const admission: { stamp: AutomationStudioSiteResetWitnessStamp | undefined; asked: number } = { stamp: undefined, asked: 0 };
  const resolvePlanNodeParameters: Resolver = async ({ permission, declaredConsequences }) => {
    if (declaredConsequences?.length) await permission({ consequences: [...declaredConsequences], control: { name: "Save", place: "c:save", state: "s:off" }, verb: "press" });
    return { status: "unchanged" };
  };
  const permissionFor = ({ witnessed }: { definitionId: string; ref: string; witnessed?: (stamp: AutomationStudioSiteResetWitnessStamp | undefined) => void }) => async () => {
    admission.asked += 1;
    witnessed?.(admission.stamp);
    return { permitted: true as const };
  };
  const submissions = new AutomationStudioFlowCandidateSubmissionController({
    projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base",
    binding: { resolvePlanNodeParameters }, permissionFor
  });
  return { submissions, admission };
}

describe("a lasting step's reset witness in a resubmission", () => {
  it("makes the same script text a new revision once the step is stamped, and unchanged while the stamp stays", async () => {
    const { submissions, admission } = controller();
    const first = await submissions.submit(script("modify_existing"));
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) return;
    expect(first.candidate.buildPlan.plan.subflows[0]!.nodes[0]).not.toHaveProperty("resetWitness");
    // The build explores the step's control; its admission now has a witness for it.
    admission.stamp = { via: "control" };
    const stamped = await submissions.submit(script("modify_existing"));
    expect(stamped.ok, JSON.stringify(stamped)).toBe(true);
    if (!stamped.ok) return;
    expect(stamped.candidate.revision).toBe(2);
    expect(stamped.candidate.digest).not.toBe(first.candidate.digest);
    expect(stamped.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.resetWitness).toEqual({ via: "control" });
    expect(submissions.matches(stamped.candidate)).toBe(true);
    // The same text with the same stamp changes nothing.
    const again = await submissions.submit(script("modify_existing"));
    expect(again).toMatchObject({ ok: false, revision: 2, check: { issueCodes: ["candidate.unchanged_submission"] } });
    expect(submissions.matches(stamped.candidate)).toBe(true);
    // A stamp that changes again is a new revision again.
    admission.stamp = { via: "destination", ref: "destination-1" };
    const moved = await submissions.submit(script("modify_existing"));
    expect(moved.ok && moved.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.resetWitness).toEqual({ via: "destination", ref: "destination-1" });
  });

  it("still refuses the same text of a Flow with no reversible lasting step before checking it again", async () => {
    const { submissions, admission } = controller();
    expect((await submissions.submit(script("none"))).ok).toBe(true);
    const asked = admission.asked;
    admission.stamp = { via: "control" };
    expect(await submissions.submit(script("none"))).toMatchObject({ ok: false, revision: 1, check: { issueCodes: ["candidate.unchanged_submission"] } });
    expect(admission.asked).toBe(asked);
  });
});

describe("a composed whole candidate", () => {
  /** The plan an accepted proposal holds: resolved, with its lasting step stamped. */
  async function proposal(stamp: AutomationStudioSiteResetWitnessStamp) {
    const { submissions, admission } = controller();
    admission.stamp = stamp;
    const accepted = await submissions.submit(script("modify_existing"));
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.check.feedback));
    return structuredClone(accepted.candidate.buildPlan.plan);
  }

  it("keeps every node's reset witness, and a changed stamp is a new revision", async () => {
    const composer = controller().submissions;
    const plan = await proposal({ via: "repeats", act: "act-4" });
    const composed = await composer.submitComposed({ plan, summary: "Save the item" });
    expect(composed.ok, JSON.stringify(composed)).toBe(true);
    if (!composed.ok) return;
    expect(composed.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.resetWitness).toEqual({ via: "repeats", act: "act-4" });
    expect(composed.candidate.buildPlan.subflows[0]!.nodes[0]!.resetWitness).toEqual({ via: "repeats", act: "act-4" });
    const restamped = await composer.submitComposed({ plan: await proposal({ via: "own_list" }), summary: "Save the item" });
    expect(restamped.ok && restamped.candidate.revision).toBe(2);
    expect(restamped.ok && restamped.candidate.buildPlan.plan.subflows[0]!.nodes[0]!.resetWitness).toEqual({ via: "own_list" });
  });

  it("is refused where a node carries a malformed stamp, never keeping it", async () => {
    const plan = await proposal({ via: "control" });
    (plan.subflows[0]!.nodes[0] as { resetWitness?: unknown }).resetWitness = { via: "control", place: "c:opaque" };
    const refused = await controller().submissions.submitComposed({ plan, summary: "Save the item" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.check.issueCodes).toContain("bootstrap.invalid_reset_witness");
  });
});

describe("a trial port's acts", () => {
  it("keep each act's step stamp when it is a valid one, and keep the act without a malformed one", () => {
    const act = (witness: unknown) => ({ step: 1, definitionId: "domain.demo.press", consequences: ["modify_existing"], witness });
    expect(automationStudioCandidateTrialActs([act({ via: "control" }), act({ via: "destination", ref: "destination-3" }), act({ via: "control", place: "c:opaque" }), act(undefined)]).map((kept) => kept.witness)).toEqual([{ via: "control" }, { via: "destination", ref: "destination-3" }, undefined, undefined]);
    expect(automationStudioCandidateTrialActs([act("control")])[0]).not.toHaveProperty("witness");
  });
});
