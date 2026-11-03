import type { ClientGatewayStartRecordingRequest } from "../../contracts.ts";
import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingBridgeState } from "../internal/index.ts";
import type { StartClientRecordingInput } from "../start-input.ts";
import { clientRecordingDefaults, emptyClientStateSnapshot, compactJsonObject, stringMetadataValue } from "../values/index.ts";

export async function startRecording<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, input: StartClientRecordingInput): Promise<RecordingSession<TTarget, TEvidence>> {
  const description = state.startPolicy.description(input.description, "host");
  if (!description.ok) throw new Error(description.code);
  if (state.gateway.isScopedSession(input.sessionId)) throw new Error("recording.scoped_session_refused");
  const session = state.session(input.sessionId);
  const ownerKey = state.recordingOwnerKey(session);
  const received = state.writeOrder.settled(ownerKey);
  const recordingId = input.recordingId ?? `client.${session.clientId}.${Date.now()}`;
  const request: ClientGatewayStartRecordingRequest = { recordingId, ...(input.projectId !== undefined ? { projectId: input.projectId } : {}), ...(input.taskId !== undefined ? { taskId: input.taskId } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(input.domainId !== undefined ? { domainId: input.domainId } : {}), ...(input.metadata !== undefined ? { metadata: input.metadata } : {}) };
  const context = await state.startPolicy.context({ session, request, origin: "host" });
  if (!context.ok) throw new Error(context.code);
  const projectId = context.projectId;
  const domainId = context.domainId !== undefined ? context.domainId : input.domainId ?? stringMetadataValue(session.metadata, "domainId") ?? null;
  await received;
  await state.startPolicy.recheck?.({ session, request, context });
  const recording = await state.sink.create({
    ...(projectId !== undefined ? { projectId } : {}), recordingId,
    ...(description.description !== undefined ? { description: description.description } : {}), ...(context.taskId !== undefined ? { taskId: context.taskId } : {}),
    ...clientRecordingDefaults(session, domainId, true), initialState: emptyClientStateSnapshot(session),
    metadata: compactJsonObject({ createdFrom: "client-gateway", sessionId: session.sessionId, clientId: session.clientId, clientName: session.name, ...(input.metadata ?? {}) })
  });
  await state.startPolicy.recheck?.({ session, request, context });
  const storedDomain = recording.environment.domainId;
  if (context.domainId !== undefined && storedDomain !== context.domainId) throw new Error("recording.domain_scope_refused");
  state.activeRecordings.set(ownerKey, { ...(projectId !== undefined ? { projectId } : {}), recordingId: recording.recordingId, ...(storedDomain !== undefined ? { domainId: storedDomain } : {}) });
  await state.gateway.startRecording(session.sessionId, { recordingId: recording.recordingId, ...(projectId !== undefined ? { projectId } : {}), ...(context.taskId !== undefined ? { taskId: context.taskId } : {}), ...(storedDomain ? { domainId: storedDomain } : {}) });
  return recording;
}
