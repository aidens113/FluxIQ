// Re-issues a recorded command a caller asked the gateway to send, other than
// an action (traces and offline trials, P3): a recording start or stop, a
// snapshot request, a ping or an error, through the gateway's own public
// method, with its fields read by name from the recorded message. A ping's
// nonce is fed by the replay's id source. Throws when the recorded message
// does not carry what the method needs.

import type { ClientGatewayService } from "../../service.ts";
import type { JsonObject } from "../../../core/index.ts";

type StartRecording = { recordingId: string; projectId?: string | null; taskId?: string; domainId?: string };

/** `messageType` with payload `body`, re-issued to `sessionId`. */
export async function issueClientGatewayTraceCallerCommand(gateway: ClientGatewayService, sessionId: string, messageType: string, body: { readonly [key: string]: unknown }): Promise<void> {
  if (messageType === "server.start_recording") {
    await gateway.startRecording(sessionId, startRecording(body));
    return;
  }
  if (messageType === "server.stop_recording") {
    await gateway.stopRecording(sessionId, optionalString(body, "recordingId"));
    return;
  }
  if (messageType === "server.capture_snapshot") {
    const kind = optionalString(body, "kind");
    const metadata = optionalObject(body, "metadata");
    await gateway.captureSnapshot(sessionId, { ...(kind !== undefined ? { kind } : {}), ...(metadata !== undefined ? { metadata } : {}) });
    return;
  }
  if (messageType === "server.ping") {
    await gateway.sendPing(sessionId);
    return;
  }
  if (messageType !== "server.error") throw new Error(`a recorded ${messageType} is not a command a caller issues`);
  const message = body.message;
  if (typeof message !== "string") throw new Error("the recorded error carries no message");
  const code = optionalString(body, "code");
  const metadata = optionalObject(body, "metadata");
  await gateway.sendError(sessionId, { message, ...(code !== undefined ? { code } : {}), ...(metadata !== undefined ? { metadata } : {}) });
}

/** The start request in the recorded field order, so the message the gateway builds from it keeps that order. */
function startRecording(body: { readonly [key: string]: unknown }): StartRecording {
  const fields = Object.entries(body).filter(([key]) => key === "recordingId" || key === "projectId" || key === "taskId" || key === "domainId");
  const request: Record<string, unknown> = Object.fromEntries(fields);
  if (!isStartRecording(request)) throw new Error("the recorded recording start carries no recording id");
  return request;
}

function isStartRecording(value: Record<string, unknown>): value is StartRecording & Record<string, unknown> {
  const projectId = value.projectId;
  if (typeof value.recordingId !== "string") return false;
  if (projectId !== undefined && projectId !== null && typeof projectId !== "string") return false;
  return (value.taskId === undefined || typeof value.taskId === "string") && (value.domainId === undefined || typeof value.domainId === "string");
}

function optionalString(body: { readonly [key: string]: unknown }, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`the recorded ${key} is not a string`);
  return value;
}

function optionalObject(body: { readonly [key: string]: unknown }, key: string): JsonObject | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (!isJsonObject(value)) throw new Error(`the recorded ${key} is not an object`);
  return structuredClone(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
