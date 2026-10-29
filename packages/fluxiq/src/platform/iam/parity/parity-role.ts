import type { IamPolicy } from "../types.ts";

/**
 * One role as the parity check compares it: today's permission list (what
 * `GlobalProgramApiRegistry.call` checks with `permissions.includes`) and the
 * identity policies the role is replaced by under IAM.
 */
export type IamParityRole = {
  id: string;
  permissions: readonly string[];
  policies: readonly IamPolicy[];
};
