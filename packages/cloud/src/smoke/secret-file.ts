import type { CloudPlan } from "../plan/index.ts";

/** The host file of one of the plan's secrets, or throws when the plan has no such secret. */
export function secretFile(plan: CloudPlan, name: string): string {
  const secret = plan.secrets.find((candidate) => candidate.name === name);
  if (secret === undefined) throw new Error(`The plan has no ${name} secret.`);
  return secret.file;
}
