import type { CloudConfigFile, CloudConfigIssue } from "../types.ts";

/**
 * The rules of dedicated browsers, run after the schema passed. Core's docker
 * driver is the local simulation of production, where each environment is
 * an isolated virtual machine: it runs only on a service's local rehearsal,
 * and only where a plan sells a dedicated browser to admit one.
 */
export function checkEnvironmentRules(file: CloudConfigFile): CloudConfigIssue[] {
  if (file.environments === undefined) return [];
  const issues: CloudConfigIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if ((file.mode ?? "service") !== "service") add("environments", "applies to a service only: a self-hosted server sells no dedicated browser");
  if (file.profile !== "local") add("environments", "runs only on the local profile: production gives each environment its own virtual machine (the vm driver)");
  const dedicated = Object.values(file.billing?.plans ?? {}).some((plan) => plan.grants.some((grant) => grant.allocation === "dedicated"));
  if (!dedicated) add("environments", "needs billing with a plan that grants a dedicated browser: admission is what allocates one");
  return issues;
}
