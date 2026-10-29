import type { IamStoredRole } from "../store/index.ts";
import type { IamPolicySet, IamPrincipal } from "../types.ts";
import type { IamAuthorizeOptions } from "./authorize-options.ts";

/**
 * The subset of `IamStore` the authorizer needs, so a test (or a cache in front
 * of the store) can stand in for it. `IamStore` satisfies it structurally.
 */
export type IamPolicySource = {
  resolvePolicySet(principal: IamPrincipal, options?: IamAuthorizeOptions): Promise<IamPolicySet>;
  getRole(name: string): Promise<IamStoredRole | null>;
};
