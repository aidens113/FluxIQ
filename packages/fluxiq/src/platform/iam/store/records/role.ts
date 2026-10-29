import type { IamPolicyDocument } from "@fluxiq/contracts/iam";

/** A role as stored (record `role/<name>`). Its policies and boundary live in their own records. */
export type IamStoredRole = {
  name: string;
  trustPolicy: IamPolicyDocument;
  createdAtMs: number;
};
