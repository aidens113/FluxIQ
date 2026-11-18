import type { CloudConfigIssue } from "./types.ts";

/** A config that cannot be used, with every problem found, each on its own line. */
export class CloudConfigError extends Error {
  readonly issues: readonly CloudConfigIssue[];

  constructor(file: string, issues: readonly CloudConfigIssue[]) {
    super(`${file} is not a usable fluxiq-cloud config:\n${issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join("\n")}`);
    this.name = "CloudConfigError";
    this.issues = issues;
  }
}
