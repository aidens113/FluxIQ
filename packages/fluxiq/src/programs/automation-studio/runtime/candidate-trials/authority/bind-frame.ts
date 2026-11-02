import { candidateTrialFramePorts } from "./frame-ports.ts";

/** Only a canonical producer may register its actual orchestration callback; children still require real closure. */
export function bindCandidateTrialFrame(callback: object, automation = false): void { candidateTrialFramePorts.set(callback, Object.freeze({ automation })); }
