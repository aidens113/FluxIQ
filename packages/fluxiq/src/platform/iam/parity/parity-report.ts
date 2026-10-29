import type { FluxIQProfile } from "@fluxiq/contracts/platform";
import type { IamMatchedStatement } from "../types.ts";

/**
 * What `compareIamRoleParity` found. A pair is one registration and one role;
 * a decision is one pair under one profile.
 *
 * - `compared`: pairs; `decisions`: pairs times profiles.
 * - `allows` and `denies`: pairs today's check allows and refuses.
 * - `byRole`: the same per role, plus the IAM side per decision (`iamAllows`,
 *   `iamDenies`), the decisions that took the full-access fast path, and the
 *   mismatches.
 * - `mismatches`: every decision where IAM and today's check disagree, with
 *   the action and resource IAM evaluated and the statement that decided.
 */
export type IamParityReport = {
  registrations: number;
  roles: number;
  profiles: readonly FluxIQProfile[];
  compared: number;
  decisions: number;
  allows: number;
  denies: number;
  byRole: Readonly<Record<string, { compared: number; allows: number; denies: number; iamAllows: number; iamDenies: number; fullAccess: number; mismatches: number }>>;
  mismatches: ReadonlyArray<{
    roleId: string;
    programId: string;
    endpoint: string;
    permission: string;
    action: string;
    resource: string;
    profile: FluxIQProfile;
    today: "allow" | "deny";
    iam: "allow" | "deny";
    matched: IamMatchedStatement | "implicit";
  }>;
};
