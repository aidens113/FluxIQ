// A submission that changes nothing is not a new revision (t464).
//
// Lane B round 8 (`run-mv5jnc62-01c3609a`) sent one script unchanged seven
// times; three became new revisions, because the digest follows the resolved
// plan, and each was told to "test next". Lane C round 8
// (`run-mv5jnc51-9eac63f2`, 0076) resubmitted a refuted Flow and was accepted.
// The controller now refuses both, with what failed last, and keeps the
// current revision standing.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioFlowCandidateSubmissionController, automationStudioCandidateSubmissionRefusal } from "../index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
const submission = { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base" };

function script(text: string, extra: string[] = []): JsonObject {
  return { summary: "Inspect", flow: ["flow: Inspect", "step: inspect the value", "  node: domain.demo.inspect", `  text: ${text}`, ...extra].join("\n") };
}

async function accepted(controller: AutomationStudioFlowCandidateSubmissionController, input: JsonObject) {
  const submitted = await controller.submit(input);
  expect(submitted.ok, JSON.stringify(submitted)).toBe(true);
  if (!submitted.ok) throw new Error("refused");
  return submitted.candidate;
}

describe("an unchanged resubmission", () => {
  it("is refused when the script reads the same, without checking it again, and the current revision stands", async () => {
    let resolved = 0;
    const resolvePlanNodeParameters = async () => {
      resolved += 1;
      return { status: "unchanged" as const };
    };
    const controller = new AutomationStudioFlowCandidateSubmissionController({ ...submission, binding: { resolvePlanNodeParameters } });
    const first = await accepted(controller, script("hello"));
    const checks = resolved;
    // Only what the reader ignores differs: line endings, spaces, a blank line, a comment, the summary.
    const again = await controller.submit({ summary: "Another summary", flow: `${String(script("hello").flow).replace(/\n/gu, "\r\n  ")}\n\n# a comment` });
    expect(resolved).toBe(checks);
    expect(again).toMatchObject({ ok: false, revision: 1, check: { issueCodes: ["candidate.unchanged_submission"], feedback: { code: "candidate.unchanged_submission", unchanged: true, revision: 1, digest: first.digest } } });
    expect(controller.matches(first)).toBe(true);
    // A changed Flow is the next revision, never one the refusal used up.
    const changed = await accepted(controller, script("goodbye"));
    expect(changed.revision).toBe(2);
  });

  it("is refused when a differently written script reads to the same plan -- a quoted value among them", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const first = await accepted(controller, script("hello"));
    const quoted = await controller.submit(script("\"hello\""));
    expect(quoted).toMatchObject({ ok: false, revision: 1, check: { issueCodes: ["candidate.unchanged_submission"] } });
    expect(controller.matches(first)).toBe(true);
    // The quoted spelling is now the one remembered, so sending it again is refused before any check.
    expect(await controller.submit(script("\"hello\""))).toMatchObject({ ok: false, revision: 1 });
  });

  it("says what failed last: the standing revision's trial, from the history it is given", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const first = await accepted(controller, script("hello"));
    const lastTrial = { revision: first.revision, digest: first.digest, verdict: "execution_failed" as const, feedback: { code: "candidate.trial_execution_failed", steps: [{ step: 2, status: "failed" }] } };
    const again = await controller.submit(script("hello"), { trialOf: (candidate) => (candidate.revision === first.revision && candidate.digest === first.digest ? lastTrial : undefined) });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.check.feedback).toMatchObject({ lastTrial: { verdict: "execution_failed", feedback: lastTrial.feedback } });
    const told = automationStudioCandidateSubmissionRefusal(again);
    expect(told.resultCode).toBe("candidate.unchanged_submission");
    expect(String(told.evidence.next)).toMatch(/^Nothing changed: this is the Flow of revision 1/u);
    expect(String(told.evidence.next)).toContain("last trial answered execution_failed");
    expect(String(told.evidence.next)).not.toContain("Correct every listed issue");
  });

  it("refuses a Flow the judge refuted, even under an earlier revision, and keeps the current one standing", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const refutedFlow = await accepted(controller, script("hello"));
    const current = await accepted(controller, script("goodbye"));
    const history = { refuted: (digest: string) => (digest === refutedFlow.digest ? { said: "judge said no" } : undefined) };
    const back = await controller.submit(script("hello"), history);
    expect(back).toMatchObject({ ok: false, revision: current.revision, check: { issueCodes: ["candidate.unchanged_after_no"], feedback: { code: "candidate.unchanged_after_no", judged: { said: "judge said no" } } } });
    if (!back.ok) expect(String(back.check.feedback?.instruction)).toContain("cannot be tested again");
    expect(controller.matches(current)).toBe(true);
  });

  it("does not refuse a changed Flow, and a refusal of another kind still clears the current revision", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    await accepted(controller, script("hello"));
    expect((await controller.submit(script("hello", ["  node: missing.node"]))).ok).toBe(false);
    expect(controller.latest()).toBeUndefined();
    // With nothing standing, a changed Flow is checked and accepted.
    expect((await controller.submit(script("goodbye"))).ok).toBe(true);
  });
});

// t474, lane D round 9 (`run-mv5q4j2n-25784472`, 0124 to 0126): revision 15 was resubmitted word for word after a
// refused revision 16 and accepted as revision 17 with `changedPaths: []` and a fresh trial count, because the refusal
// had cleared the revision t464 compares with. The comparison is now with the last accepted revision.
describe("an unchanged resubmission after a refusal", () => {
  it("is refused as the last accepted revision, with its last trial, and that revision stands again", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const first = await accepted(controller, script("hello"));
    expect((await controller.submit(script("hello", ["  node: missing.node"]))).ok).toBe(false);
    expect(controller.latest()).toBeUndefined();
    const lastTrial = { revision: first.revision, digest: first.digest, verdict: "execution_failed" as const, feedback: { code: "candidate.trial_execution_failed" } };
    const again = await controller.submit(script("hello"), { trialOf: (candidate) => (candidate.revision === first.revision && candidate.digest === first.digest ? lastTrial : undefined) });
    expect(again).toMatchObject({ ok: false, revision: 1, check: { issueCodes: ["candidate.unchanged_submission"], feedback: { unchanged: true, revision: 1, digest: first.digest, lastTrial: { verdict: "execution_failed" } } } });
    expect(controller.matches(first)).toBe(true);
    expect(controller.latest()?.revision).toBe(1);
    // A changed Flow after it is the next revision.
    expect((await accepted(controller, script("goodbye"))).revision).toBe(3);
  });

  it("is refused when it reads to the last accepted revision's plan, though written differently", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const first = await accepted(controller, script("hello"));
    expect((await controller.submit(script("hello", ["  node: missing.node"]))).ok).toBe(false);
    expect(await controller.submit(script("\"hello\""))).toMatchObject({ ok: false, revision: 1, check: { issueCodes: ["candidate.unchanged_submission"] } });
    expect(controller.matches(first)).toBe(true);
  });

  it("names a refuted last revision without making it stand again", async () => {
    const controller = new AutomationStudioFlowCandidateSubmissionController(submission);
    const first = await accepted(controller, script("hello"));
    expect((await controller.submit(script("hello", ["  node: missing.node"]))).ok).toBe(false);
    const back = await controller.submit(script("hello"), { refuted: (digest) => (digest === first.digest ? { said: "judge said no" } : undefined) });
    expect(back).toMatchObject({ ok: false, revision: 1, check: { issueCodes: ["candidate.unchanged_after_no"], feedback: { judged: { said: "judge said no" } } } });
    expect(controller.latest()).toBeUndefined();
  });
});
