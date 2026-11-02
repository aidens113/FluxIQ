import type { AutomationStudioCandidateTrialPort } from "../../flow-bootstrap/candidate/index.ts";

export interface CandidateTrialReceiver { readonly candidateId: string; readonly port: AutomationStudioCandidateTrialPort; }
