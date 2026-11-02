import type { AutomationStudioActionDeclaration } from "./declaration.ts";
import type { AutomationStudioActionPermissionVerdict } from "./verdict.ts";

/**
 * The check a domain calls before an action with a lasting consequence.
 *
 * Awaited immediately before acting: the first action in a build that has a
 * lasting consequence may make Core read the person's instruction for what it
 * already asks for (`instructed.ts`), once. It rejects with
 * `AutomationStudioActionDeclarationError` when the declaration itself is
 * malformed, which fails the action loudly: an action Core could not read is
 * an action Core did not permit.
 */
export type AutomationStudioActionPermissionCheck = (declaration: AutomationStudioActionDeclaration) => Promise<AutomationStudioActionPermissionVerdict>;
