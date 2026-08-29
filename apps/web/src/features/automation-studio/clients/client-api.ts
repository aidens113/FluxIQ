"use client";

import { useMemo } from "react";
import { useProgramApi } from "../../programs/program-api";
import {
  captureClientSnapshot,
  executeClientAction,
  resolveClientPairing,
  revokeClientTrust,
  startClientRecording,
  stopClientRecording
} from "./client-commands";
import type { ClientGatewayPort } from "./client-api-types";
import { queryClientGatewaySnapshot } from "./client-queries";

export function useClientGatewayPort(): ClientGatewayPort {
  const api = useProgramApi("automation-studio");
  return useMemo(() => ({
    querySnapshot: () => queryClientGatewaySnapshot(api),
    startRecording: (input) => startClientRecording(api, input),
    stopRecording: (input) => stopClientRecording(api, input),
    captureSnapshot: (sessionId) => captureClientSnapshot(api, sessionId),
    executeAction: (input) => executeClientAction(api, input),
    revokeTrust: (input) => revokeClientTrust(api, input),
    resolvePairing: (pairingCode, action) => resolveClientPairing(pairingCode, action)
  }), [api]);
}

export { queryClientGatewaySnapshot } from "./client-queries";
export { captureClientSnapshot, executeClientAction, resolveClientPairing, revokeClientTrust, startClientRecording, stopClientRecording } from "./client-commands";
export type { ClientGatewayApi, ClientGatewayPort } from "./client-api-types";