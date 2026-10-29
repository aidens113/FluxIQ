import { z } from "zod";
import { FRN_SERVICE_SHAPES } from "../frn/index.ts";
import { isIamService } from "../service.ts";
import { IAM_ACCESS_LEVELS } from "./access-level.ts";
import { iamActionName, isIamActionName } from "./action-name.ts";

const PROGRAM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ROUTE_PATH_PATTERN = /^\/[A-Za-z0-9._~\-/[\]]*$/u;

/**
 * What an action was generated from: a program endpoint in the program
 * registry, or one of the panel's app routes.
 */
export const iamActionSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("endpoint"), programId: z.string().regex(PROGRAM_ID_PATTERN), endpoint: z.string().regex(PROGRAM_ID_PATTERN) }).strict(),
  z.object({ kind: z.literal("route"), method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]), path: z.string().max(512).regex(ROUTE_PATH_PATTERN) }).strict()
]);

/**
 * One entry of the generated action catalog
 * (`packages/contracts/src/iam/actions.generated.ts`, written by Core's catalog
 * generator and checked for drift):
 *
 * - `action`: the action name; for each endpoint source it is exactly
 *   `iamActionName(<service>, <endpoint>)`;
 * - `sources`: every registration that declares the action (several programs
 *   may register the same endpoint name), in a stable order;
 * - `accessLevel`: derived from the registration's classification
 *   (`IAM_DEFAULT_ACCESS_LEVEL_BY_CLASSIFICATION`) unless overridden;
 * - `resourceTypes`: the FRN resource types the action's `resource` extractor
 *   returns, as kind chains of the action's own service (`project`,
 *   `project/flow`), or `["*"]` for an action on no specific resource. A create
 *   or list names its parent's type;
 * - `destructive`: the endpoint keeps its PIN or re-authentication gate;
 * - `description`: one plain sentence for the policy editor and the simulator.
 */
export const iamActionCatalogEntrySchema = z
  .object({
    action: z.string().refine(isIamActionName, "an action name is <service>:<PascalCaseAction>"),
    accessLevel: z.enum(IAM_ACCESS_LEVELS),
    resourceTypes: z.array(z.string().min(1).max(128)).min(1).max(16),
    sources: z.array(iamActionSourceSchema).min(1).max(16),
    destructive: z.boolean(),
    description: z.string().min(1).max(300)
  })
  .strict()
  .superRefine((entry, context) => {
    const service = entry.action.split(":")[0];
    if (!isIamService(service)) return;
    entry.sources.forEach((source, index) => {
      if (source.kind === "endpoint" && entry.action !== iamActionName(service, source.endpoint)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources", index], message: `an endpoint action is ${iamActionName(service, source.endpoint)}` });
      }
    });
    entry.resourceTypes.forEach((chain, index) => {
      if (!resourceChainAllowed(service, chain, entry.resourceTypes.length)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["resourceTypes", index], message: `not a ${service} resource type chain` });
      }
    });
  });

export type IamActionSource = z.infer<typeof iamActionSourceSchema>;
export type IamActionCatalogEntry = z.infer<typeof iamActionCatalogEntrySchema>;

/** The whole catalog: entries with distinct action names. */
export const iamActionCatalogSchema = z.array(iamActionCatalogEntrySchema).superRefine((entries, context) => {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.action)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "action"], message: `duplicate action ${entry.action}` });
    seen.add(entry.action);
  });
});

export type IamActionCatalog = z.infer<typeof iamActionCatalogSchema>;

function resourceChainAllowed(service: keyof typeof FRN_SERVICE_SHAPES, chain: string, count: number): boolean {
  if (chain === "*") return count === 1;
  const shape = FRN_SERVICE_SHAPES[service];
  const [first, ...rest] = chain.split("/");
  if (first === undefined || !shape.types.includes(first)) return false;
  const children = shape.children?.[first] ?? [];
  return rest.every((kind) => children.includes(kind));
}
