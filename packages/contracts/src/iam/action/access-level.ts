/** An action's access level, as in the AWS IAM service authorization reference. */
export const IAM_ACCESS_LEVELS = Object.freeze(["List", "Read", "Write", "PermissionsManagement"] as const);

export type IamAccessLevel = (typeof IAM_ACCESS_LEVELS)[number];

/**
 * The access level a registration's `classification` derives by default; a
 * registration overrides it where the default is wrong (a list endpoint is
 * `List`, an `iam:` grant or attachment is `PermissionsManagement`). A
 * classification missing here has no default and must be set by hand.
 */
export const IAM_DEFAULT_ACCESS_LEVEL_BY_CLASSIFICATION: Readonly<Record<string, IamAccessLevel>> = Object.freeze({
  read: "Read",
  authoring: "Write",
  destructive: "Write",
  "destructive-ungated": "Write",
  "program-gated": "Write"
});
