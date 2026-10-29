import { IAM_READ_ONLY_ACTIONS } from "../catalog/index.ts";
import { iamActionListStatements } from "./action-list-statements.ts";
import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";
import { IAM_WORKSPACE_PATTERNS } from "./workspace-patterns.ts";

/**
 * `FluxIQReadOnlyAccess`: exactly the actions whose endpoint required
 * `programs.read`, today's `viewer`.
 *
 * - The list is the generated `IAM_READ_ONLY_ACTIONS` (catalog, regenerated
 *   from the live registry, never hand-edited), not a `*Get*`/`*List*`
 *   pattern: endpoint names do not say what they persist (`studio:Projects`,
 *   `ops:AuthorizeStore` are read-only; `studio:ListX` could one day write),
 *   so only the permission each endpoint declared is evidence.
 * - One statement per service, each `Action` at most 100 names
 *   (`iamActionListStatements`).
 * - Resources: the workspace's content and the workspace FRN, as for admin.
 * - Regenerating the list changes this document; bump the version when the
 *   generated list changes (open question in t788-E: no check enforces it).
 */
export const IAM_READ_ONLY_ACCESS = defineIamPredefinedPolicy(
  "FluxIQReadOnlyAccess",
  "v1",
  iamActionListStatements("ReadOnly", "Allow", IAM_READ_ONLY_ACTIONS, [IAM_WORKSPACE_PATTERNS.content, IAM_WORKSPACE_PATTERNS.workspace])
);
