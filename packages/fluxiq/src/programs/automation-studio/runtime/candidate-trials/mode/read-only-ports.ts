import type { AutomationStudioCandidateTrialPort } from "../../flow-bootstrap/candidate/index.ts";

export const candidateTrialReadOnlyPorts = new WeakMap<object, { cached?: AutomationStudioCandidateTrialPort; offline?: { callback: AutomationStudioCandidateTrialPort; environment: object; lease: object } }>();
