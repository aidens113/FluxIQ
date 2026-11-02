import { trialExecutionObservations } from "./registry.ts";

export function trialExecutionObservation(target: object) { return trialExecutionObservations.get(target); }
