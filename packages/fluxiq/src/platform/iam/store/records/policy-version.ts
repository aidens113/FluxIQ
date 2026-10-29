import type { IamPolicyDocument } from "@fluxiq/contracts/iam";

/** One version of a customer-managed policy. Ids are `v1`, `v2`, ... and never reused. */
export type IamPolicyVersion = {
  id: string;
  document: IamPolicyDocument;
  createdAtMs: number;
};
