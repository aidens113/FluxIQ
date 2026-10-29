import type { IamPrincipalType } from "@fluxiq/contracts/iam";

/** A principal FRN, parsed: what kind it is and its id. */
export type IamPrincipalRef = {
  frn: string;
  type: IamPrincipalType;
  id: string;
};
