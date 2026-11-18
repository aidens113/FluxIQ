import type { ConnectCodeRepository, ConnectService } from "fluxiq/platform";

export type ConnectComposition = { root: string; repository: ConnectCodeRepository; service: ConnectService };
const state = globalThis as typeof globalThis & { __fluxiqConnectCompositions?: Map<string, ConnectComposition> };
export const connectCompositions = state.__fluxiqConnectCompositions ??= new Map<string, ConnectComposition>();
