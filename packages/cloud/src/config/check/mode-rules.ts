import type { CloudConfigFile, CloudConfigIssue } from "../types.ts";

/**
 * The rules of the deployment mode, run after the schema passed. A service
 * is the hosted product: it needs the payments API, and sign-up is its own
 * setting. A self-hosted server is one company's own: the full base product
 * with no billing, no payments API, no provisioning listener and no sign-up,
 * so a setting that only a service uses is refused naming it rather than
 * silently ignored.
 */
export function checkModeRules(file: CloudConfigFile): CloudConfigIssue[] {
  const issues: CloudConfigIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if ((file.mode ?? "service") === "service") {
    if (file.payments === undefined) add("payments", "is required on a service: it names the payments API");
    return issues;
  }
  const only = "applies to a service only; a self-hosted server has none";
  if (file.payments !== undefined) add("payments", only);
  if (file.billing !== undefined) add("billing", only);
  if (file.signup !== undefined) add("signup", only);
  if (file.signUpUrl !== undefined) add("signUpUrl", only);
  if (file.provisioning !== undefined) add("provisioning", only);
  if (file.sinks?.payments === true) add("sinks.payments", only);
  return issues;
}
