import { expect, it, vi } from "vitest";
import { generateRecordingDeterministicSubflow } from "../recording-commands";

it("retires recording-only generation without any proposal or approval request", async () => {
  const post = vi.fn();
  const result = await generateRecordingDeterministicSubflow({ post }, { projectId: "project.one", recordingId: "recording.one", flowId: "flow.one", authorizationPin: "" });
  expect(result.ok).toBe(false);
  expect(result.error).toContain("Author task instructions");
  expect(post).not.toHaveBeenCalled();
});
