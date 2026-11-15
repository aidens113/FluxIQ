import { z } from "zod";
import { FLUXNODE_ACT_CLASSES } from "../../fluxnode/spec/index.ts";
import { appFields, appOriginSchema, appUniqueList } from "../validation/index.ts";

const binding = { bindingId: appFields.id };
export const appGrantSchema = z.discriminatedUnion("capability", [
  z.object({ capability: z.literal("dataset.read"), ...binding }).strict(),
  z.object({ capability: z.literal("dataset.write"), ...binding }).strict(),
  z.object({ capability: z.literal("secret.use"), ...binding }).strict(),
  z.object({ capability: z.literal("network.origin"), origin: appOriginSchema }).strict(),
  z.object({ capability: z.literal("automation.execute"), ...binding, acts: appUniqueList(z.enum(FLUXNODE_ACT_CLASSES), value => value, 4) }).strict()
]);
export type AppGrant = z.infer<typeof appGrantSchema>;
