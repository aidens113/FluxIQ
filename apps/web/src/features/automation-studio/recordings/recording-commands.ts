import type { RecordingApi } from "./recording-api-types";

export async function generateRecordingDeterministicSubflow(api: RecordingApi, input: { projectId: string; recordingId: string; flowId: string; authorizationPin: string }) {
  const generated = await api.post<{ proposals?: Record<string, unknown>[]; issues?: string[] }>("create-recording-flow-proposals", {
    projectId: input.projectId,
    recordingId: input.recordingId,
    force: true
  });
  if (!generated.ok) return { ok: false, error: generated.error ?? "Recording proposal generation failed." };
  const proposals = generated.payload?.proposals ?? [];
  const issues = generated.payload?.issues ?? [];
  if (proposals.length !== 1 || typeof proposals[0]?.proposalId !== "string") {
    return { ok: false, error: proposals.length ? "Recording generation produced more than one deterministic proposal." : issues.join(" ") || "Recording generation produced no actionable proposal." };
  }
  const reviewed = await api.post<{ proposal?: Record<string, unknown>; flow?: Record<string, unknown> }>("review-recording-flow-proposal", {
    projectId: input.projectId,
    proposalId: proposals[0].proposalId,
    decision: "approved",
    authorizationPin: input.authorizationPin,
    destination: { kind: "flow", flowId: input.flowId, writeMode: "replace_recording_derived" }
  });
  if (!reviewed.ok || !reviewed.payload?.proposal || !reviewed.payload.flow) return { ok: false, error: reviewed.error ?? "Recording proposal approval did not return a Flow." };
  return { ok: true, payload: { proposal: reviewed.payload.proposal, flow: reviewed.payload.flow, issues } };
}

export function repairRecordingStateIndex(api: RecordingApi, input: { projectId: string; recordingId: string; authorizationPin: string }) {
  return api.post<{ warnings?: string[] }>("repair-recording-state-index", {
    projectId: input.projectId,
    recordingId: input.recordingId,
    mode: "write",
    authorizationPin: input.authorizationPin
  });
}