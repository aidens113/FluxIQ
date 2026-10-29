import type { IamPolicy } from "../types.ts";

/**
 * What a request adds to the caller's own policies: the role the caller
 * assumed (its policies apply too) and the session policies in force (each
 * must also allow). `assumeRole` returns the pair to pass to later calls.
 */
export type IamAuthorizeOptions = {
  assumedRole?: string;
  sessionPolicies?: IamPolicy[];
};
