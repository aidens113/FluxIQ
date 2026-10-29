import type { IamPolicyDocument } from "@fluxiq/contracts/iam";

/** An inline identity policy owned by one principal (record `inline/<principal FRN>/<name>`). */
export type IamStoredInlinePolicy = {
  principalFrn: string;
  name: string;
  document: IamPolicyDocument;
};
