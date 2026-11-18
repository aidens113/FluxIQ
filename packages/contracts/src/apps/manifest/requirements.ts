import { z } from "zod";
import { appFields, appUniqueList } from "../validation/index.ts";

export const appRequirementsSchema = z.object({
  runtimes: appUniqueList(appFields.id, value => value, 32),
  environments: appUniqueList(appFields.environment, value => value, 3).refine(values => values.length > 0),
  callbacks: appUniqueList(z.object({ id: appFields.id, kind: z.enum(["server", "local-worker", "browser-interaction"]) }).strict(), value => value.id, 64)
}).strict();
