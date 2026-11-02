import type { RecordingStartPolicy, RecordingDescriptionOutcome, RecordingStartContext } from "../../../client-gateway/recording/policies/index.ts";
import type { ClientGatewaySession, ClientGatewayStartRecordingRequest } from "../../../client-gateway/index.ts";
import { requiredRecordingDescription } from "../runtime/service/instruction-led/index.ts";
import type { ClientRecordingContextProvider } from "./context.ts";

export class StudioRecordingStartPolicy implements RecordingStartPolicy {
  readonly diagnosticMetadata = { source: "automation-studio" };
  private receiver: object | undefined;
  constructor(private provider: ClientRecordingContextProvider | undefined) {}
  bindReceiver(receiver: object): void { this.receiver = receiver; }
  setProvider(provider: ClientRecordingContextProvider | undefined): void { this.provider = provider; }
  description(value: unknown, origin: "host" | "client"): RecordingDescriptionOutcome {
    if (origin === "host") return { ok: true, description: requiredRecordingDescription(value) };
    if (typeof value !== "string" || !value.trim() || value.trim().length > 4000) return { ok: false, code: "recording.description_required", message: "Describe what this recording demonstrates before starting it." };
    return { ok: true, description: value.trim() };
  }
  async context(input: { session: ClientGatewaySession; request: ClientGatewayStartRecordingRequest; origin: "host" | "client" }): Promise<RecordingStartContext> {
    const { session, request } = input;
    if (input.origin === "host") {
      const projectId = request.projectId ?? session.projectId;
      return { ok: true, ...(projectId !== undefined ? { projectId } : {}), ...(request.taskId !== undefined ? { taskId: request.taskId } : {}) };
    }
    const provider = this.provider;
    if (provider) {
      const approved = await provider.call(this.receiver, { session, request });
      if (!approved.ok) return { ok: false, code: approved.code ?? "recording.project_required", message: approved.message, ...(approved.metadata ? { metadata: approved.metadata } : {}) };
      return { ok: true, projectId: approved.projectId, ...(approved.taskId !== undefined ? { taskId: approved.taskId } : request.taskId !== undefined ? { taskId: request.taskId } : {}) };
    }
    if (request.projectId) return { ok: true, projectId: request.projectId, ...(request.taskId !== undefined ? { taskId: request.taskId } : {}) };
    return { ok: false, code: "recording.project_required", message: "Recording cannot start because Automation Studio does not have an open project." };
  }
}
