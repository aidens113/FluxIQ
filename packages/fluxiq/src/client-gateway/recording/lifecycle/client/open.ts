import type { ClientGatewaySession, ClientGatewayStartRecordingRequest } from "../../../contracts.ts";
import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingBridgeState, PendingClientStart } from "../../internal/index.ts";
import { decodeRecordingEnvironment, decodeRecordingSources, decodeRecordingActionChannels } from "../../decoding/index.ts";
import { clientRecordingDefaults, emptyClientStateSnapshot, compactJsonObject, stringMetadataValue } from "../../values/index.ts";

export async function openClientRecording<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, input: ClientGatewayStartRecordingRequest, pending: PendingClientStart): Promise<RecordingSession<TTarget, TEvidence> | null> {
  const description = state.startPolicy.description(input.description, "client");
  if (!description.ok) {
    await state.gateway.sendError(session.sessionId, { code: description.code, message: description.message });
    return null;
  }
  const context = await state.resolveClientRecordingContext(session, input);
  if (!context.ok) {
    await state.gateway.sendError(session.sessionId, { code: context.code, message: context.message, metadata: { ...state.startPolicy.diagnosticMetadata, clientId: session.clientId, clientName: session.name, ...(context.metadata ?? {}) } });
    return null;
  }
  const projectId = context.projectId;
  if (projectId !== undefined) pending.projectId = projectId;
  const taskId = context.taskId;
  const domainId = context.domainId !== undefined ? context.domainId : input.domainId ?? stringMetadataValue(input.metadata, "domainId") ?? stringMetadataValue(session.metadata, "domainId") ?? null;
  const defaults = clientRecordingDefaults(session, domainId, false);
  const environment = input.environment !== undefined ? decodeRecordingEnvironment(input.environment) : defaults.environment;
  await state.startPolicy.recheck?.({ session, request: input, context });
  const recording = await state.sink.create({
    ...(projectId !== undefined ? { projectId } : {}), recordingId: input.recordingId,
    ...(description.description !== undefined ? { description: description.description } : {}), ...(taskId !== undefined ? { taskId } : {}), ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
    environment: context.domainId !== undefined ? { ...environment, domainId: context.domainId } : environment,
    sources: input.sources !== undefined ? decodeRecordingSources(input.sources) : defaults.sources,
    actionChannels: input.actionChannels !== undefined ? decodeRecordingActionChannels(input.actionChannels) : defaults.actionChannels,
    initialState: input.initialState !== undefined ? state.ingress.initialState(input.initialState) : emptyClientStateSnapshot(session),
    metadata: compactJsonObject({ createdFrom: "client-gateway", sessionId: session.sessionId, clientId: session.clientId, clientName: session.name, ...(input.metadata ?? {}) })
  });
  await state.startPolicy.recheck?.({ session, request: input, context });
  const storedDomain = recording.environment.domainId;
  if (context.domainId !== undefined && storedDomain !== context.domainId) throw new Error("recording.domain_scope_refused");
  state.activeRecordings.set(state.recordingOwnerKey(session), { ...(projectId !== undefined ? { projectId } : {}), recordingId: recording.recordingId, ...(storedDomain !== undefined ? { domainId: storedDomain } : {}) });
  const accepted = { recordingId: recording.recordingId, ...(projectId !== undefined ? { projectId } : {}), ...(taskId !== undefined ? { taskId } : {}), ...(storedDomain ? { domainId: storedDomain } : {}) };
  if (pending.stopRequested) state.gateway.markActiveRecording(session.sessionId, accepted);
  else await state.gateway.startRecording(session.sessionId, accepted);
  return recording;
}
