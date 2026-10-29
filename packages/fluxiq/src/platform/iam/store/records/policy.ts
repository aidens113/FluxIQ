import type { IamPolicyVersion } from "./policy-version.ts";

/** A customer-managed policy as stored (record `policy/<name>`). Only the default version applies. */
export type IamStoredPolicy = {
  name: string;
  kind: "identity" | "boundary" | "guardrail";
  defaultVersionId: string;
  nextVersionNumber: number;
  versions: IamPolicyVersion[];
  createdAtMs: number;
  updatedAtMs: number;
};
