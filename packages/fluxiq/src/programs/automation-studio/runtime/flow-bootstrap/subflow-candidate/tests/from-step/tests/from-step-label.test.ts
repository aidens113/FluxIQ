import { describe, expect, it } from "vitest";
import { AutomationStudioSubflowScopedSubmissionController, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowFromStepRequest, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPreparingPort } from "../../../index.ts";
import { SIBLINGS, script, testScope, testSubmission } from "../../subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };

function fixture(labels?: Record<string, string[]>) {
  const latest: AutomationStudioSubflowProposal = {
    scope: identity, revision: 1, digest: "d".repeat(64), summary: "Find", changedPaths: [],
    subflows: [{ key: scope.subflowKey, name: "Find", role: "primary", edges: [], nodes: ["s1", "s2"].map(key => ({ key, definitionId: "web.browser.navigate", definitionVersion: "1", label: key, parameters: { url: "https://listings.test/all" } })) }],
    ...(labels ? { stepLabels: labels } : {})
  };
  const ran: AutomationStudioSubflowFromStepRequest[] = [];
  const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(async () => { throw new Error("a from-step run must never ask the judge"); }, {
    fromStep: async (request: AutomationStudioSubflowFromStepRequest) => {
      ran.push(request);
      return { fromStep: true as const, identity: request.proposal.scope, revision: request.proposal.revision, digest: request.proposal.digest, fromKey: request.fromKey, status: "ended" as const, passedKeys: [request.fromKey], feedback: {} };
    }
  });
  return { ran, gate: new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(latest), port }) };
}

describe("a script label naming a from-step run", () => {
  it("resolves a unique label case-insensitively with the latest receipt default", async () => {
    const { gate, ran } = fixture({ second: ["s2"] });
    expect((await gate.test({ from: "SECOND" })).evidence).toMatchObject({ fromStep: true, passed: true, from: "s2", fromLabel: "second" });
    expect(ran.map(request => request.fromKey)).toEqual(["s2"]);
  });

  it("refuses an ambiguous label and an unknown label without running anything", async () => {
    const { gate, ran } = fixture({ repeated: ["s1", "s2"], second: ["s2"] });
    expect((await gate.test({ from: "repeated" })).evidence).toMatchObject({ ok: false, code: "subflow.from_step_unknown", ambiguous: ["s1", "s2"], labelled: [{ key: "s1", labels: ["repeated"] }, { key: "s2", labels: ["repeated", "second"] }] });
    expect((await gate.test({ from: "missing" })).evidence).toMatchObject({ code: "subflow.from_step_unknown", steps: ["s1", "s2"] });
    expect(ran).toEqual([]);
  });

  it("gives an exact plan key priority over a label and keeps plan-only proposals working", async () => {
    const { gate, ran } = fixture({ s1: ["s2"] });
    const answer = (await gate.test({ from: "s1" })).evidence;
    expect(answer).toMatchObject({ fromStep: true, from: "s1" });
    expect(answer).not.toHaveProperty("fromLabel");
    expect(ran[0]?.fromKey).toBe("s1");
    expect((await fixture().gate.test({ from: "s2" })).evidence).toMatchObject({ fromStep: true, from: "s2" });
  });

  it("keeps accepted labels outside the executable digest without accepting an unchanged resubmission", async () => {
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: testSubmission() });
    const lines = (label: string) => ["flow: Find the listings", "step first: open the listings", "  node: web.browser.navigate", "  url: https://listings.test/all", `step ${label}: read the next listing`, "  node: web.browser.navigate", "  url: https://listings.test/next"];
    const one = await controller.submit(script(lines("second")));
    expect(one.ok, JSON.stringify(one)).toBe(true);
    if (!one.ok) throw new Error("first submission was refused");
    expect(structuredClone(one.proposal).stepLabels).toMatchObject({ first: ["s1"], second: ["s2"] });
    const unchanged = await controller.submit(script(lines("renamed")));
    expect(unchanged).toMatchObject({ ok: false, check: { issueCodes: ["candidate.unchanged_submission"] } });
    expect(controller.latest()?.stepLabels).toEqual(one.proposal.stepLabels);
    // Independently accepted equivalent scripts have the same executable identity.
    const other = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: testSubmission() });
    const two = await other.submit(script(lines("renamed")));
    expect(two.ok, JSON.stringify(two)).toBe(true);
    if (!two.ok) throw new Error("relabelled submission was refused");
    expect(two.proposal.digest).toBe(one.proposal.digest);
    expect(two.proposal.revision).toBe(one.proposal.revision);
    expect(two.proposal.stepLabels).toMatchObject({ first: ["s1"], renamed: ["s2"] });
    expect(two.proposal.stepLabels).not.toHaveProperty("second");
  });
});
