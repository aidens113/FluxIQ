import type { IamPrincipalType } from "@fluxiq/contracts/iam";

/** The PascalCase noun of a principal type, as it appears in IAM action names (`iam:AttachUserPolicy`). */
export function principalTypeLabel(type: IamPrincipalType): string {
  if (type === "user") return "User";
  if (type === "group") return "Group";
  if (type === "role") return "Role";
  return "ServiceIdentity";
}
