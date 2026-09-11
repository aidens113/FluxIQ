import { describe, expect, it, vi } from "vitest";
import { generateRecordingDeterministicSubflow } from "../recording-commands";

describe("recording-derived Subflow generation", () => {
  it("generates one proposal and approves it into the selected Flow with guarded replacement", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: true, payload: { proposals: [{ proposalId: "proposal.one" }], issues: [] } })
      .mockResolvedValueOnce({ ok: true, payload: { proposal: { proposalId: "proposal.one" }, flow: { flowId: "flow.one" } } });

    await expect(generateRecordingDeterministicSubflow({ post }, {
      projectId: "project.one",
      recordingId: "recording.one",
      flowId: "flow.one",
      authorizationPin: "1234"
    })).resolves.toMatchObject({ ok: true, payload: { flow: { flowId: "flow.one" } } });

    expect(post).toHaveBeenNthCalledWith(1, "create-recording-flow-proposals", {
      projectId: "project.one",
      recordingId: "recording.one",
      force: true
    });
    expect(post).toHaveBeenNthCalledWith(2, "review-recording-flow-proposal", {
      projectId: "project.one",
      proposalId: "proposal.one",
      decision: "approved",
      authorizationPin: "1234",
      destination: { kind: "flow", flowId: "flow.one", writeMode: "replace_recording_derived" }
    });
  });

  it("fails closed when mapping does not produce exactly one proposal", async () => {
    const noProposal = vi.fn().mockResolvedValue({ ok: true, payload: { proposals: [], issues: ["No actions mapped."] } });
    await expect(generateRecordingDeterministicSubflow({ post: noProposal }, {
      projectId: "project.one",
      recordingId: "recording.one",
      flowId: "flow.one",
      authorizationPin: "1234"
    })).resolves.toEqual({ ok: false, error: "No actions mapped." });

    const ambiguous = vi.fn().mockResolvedValue({ ok: true, payload: { proposals: [{ proposalId: "one" }, { proposalId: "two" }], issues: [] } });
    await expect(generateRecordingDeterministicSubflow({ post: ambiguous }, {
      projectId: "project.one",
      recordingId: "recording.one",
      flowId: "flow.one",
      authorizationPin: "1234"
    })).resolves.toEqual({ ok: false, error: "Recording generation produced more than one deterministic proposal." });
  });
});