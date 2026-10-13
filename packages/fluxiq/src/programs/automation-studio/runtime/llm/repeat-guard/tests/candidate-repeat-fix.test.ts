// A refused script sent again unchanged is answered with the exact fix (t514).
//
// Social gate run `run-mv6v2jh4-69244ffb` sent its refused revision 2 three
// more times, word for word, and was told each time only to "change the lines
// those issues name". The issues did not say what to write, so nothing changed
// and the build ended. The note now repeats each issue's own fix with its line
// and step, and points to `core.describe_nodes` for the node it names.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatGuard } from "../outcomes.ts";
import { automationStudioLlmEvidenceRepeatRefusalNote } from "../feedback.ts";

const SCRIPT = { flow: "flow: Post\nstep: wait for the composer to close\n  node: domain.demo.wait\n  target: t846\n  state: absent" };

function noteFor(issues: unknown[]) {
  const guard = automationStudioLlmEvidenceRepeatGuard();
  guard.seen("s1");
  guard.recorded({
    callId: "submit-3", toolId: "core.submit_candidate", input: SCRIPT, effect: "observe", proposes: true, effectApplied: false, refused: true,
    resultCode: "flow_bootstrap.completion_refused",
    answer: JSON.stringify({ ok: false, revision: 2, diagnostics: { ok: false, refusal: "flow_bootstrap.completion_refused", issues }, issueCodes: ["bootstrap.unknown_parameter"], next: "Correct every listed issue." })
  });
  return automationStudioLlmEvidenceRepeatRefusalNote({ toolId: "core.submit_candidate", earlier: guard.blocks("core.submit_candidate", SCRIPT)!, inARow: 1, candidate: true });
}

describe("an unchanged refused submission sent again", () => {
  it("repeats each issue's fix with its line and step, and points to core.describe_nodes for its node", () => {
    const instruction = String(noteFor([{
      code: "bootstrap.unknown_parameter",
      path: "plan.subflows.0.nodes.1.parameters.state",
      step: "wait for the composer to close",
      line: 28,
      node: "domain.demo.wait",
      instead: "Write `wait: condition=absent` in place of `state: absent`: no parameter of this step is called `state`, and `wait` takes `absent` as its `condition`."
    }]).instruction);
    expect(instruction).toContain("line 28");
    expect(instruction).toContain("wait for the composer to close");
    expect(instruction).toContain("Write `wait: condition=absent` in place of `state: absent`");
    expect(instruction).toContain("core.describe_nodes");
    expect(instruction).toContain("domain.demo.wait");
  });

  it("points to core.describe_nodes even when no issue says what to write", () => {
    const instruction = String(noteFor([{ code: "bootstrap.unknown_parameter", path: "plan.subflows.0.nodes.1.parameters.state", step: "wait", line: 28, node: "domain.demo.wait" }]).instruction);
    expect(instruction).toContain("core.describe_nodes");
    expect(instruction).toContain("domain.demo.wait");
  });
});
