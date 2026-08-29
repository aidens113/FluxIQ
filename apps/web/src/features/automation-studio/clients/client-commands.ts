import type { ClientGatewayApi } from "./client-api-types";

export function startClientRecording(api: ClientGatewayApi, input: { sessionId: string; projectId: string | null; authorizationPin: string }) {
  return api.post<any>("start-client-recording", input);
}

export function stopClientRecording(api: ClientGatewayApi, input: { sessionId: string; authorizationPin: string }) {
  return api.post<any>("stop-client-recording", input);
}

export function captureClientSnapshot(api: ClientGatewayApi, sessionId: string) {
  return api.post("capture-client-snapshot", { sessionId, kind: "dom" });
}

export function executeClientAction(api: ClientGatewayApi, input: { sessionId: string; authorizationPin: string; command: Record<string, unknown> }) {
  return api.post<any>("execute-client-action", input);
}

export function revokeClientTrust(api: ClientGatewayApi, input: { trustedClientId: string; authorizationPin: string }) {
  return api.post("revoke-client-trust", input);
}

export async function resolveClientPairing(pairingCode: string, action: "approve" | "reject", request: typeof fetch = fetch) {
  const response = await request(`/api/client-gateway/${action === "approve" ? "approve-pairing" : "dismiss-pairing"}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairingCode })
  });
  if (response.ok) return { ok: true as const };
  const result = await response.json().catch(() => undefined) as { error?: string } | undefined;
  return { ok: false as const, error: result?.error ?? "Pairing request could not be resolved." };
}