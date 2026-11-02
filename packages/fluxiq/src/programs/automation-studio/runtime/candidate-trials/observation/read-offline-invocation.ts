import { trialOfflineInvocations } from "./offline-invocations.ts";

export function trialOfflineInvocation(input: object) { return trialOfflineInvocations.get(input); }
