import { appUniqueList } from "../validation/index.ts";
import { appGrantSchema } from "./schema.ts";

/** A capability/binding appears once; its effect set is explicit rather than merged implicitly. */
export const appGrantListSchema = appUniqueList(appGrantSchema, grant => grant.capability === "network.origin" ? `${grant.capability}:${grant.origin}` : `${grant.capability}:${grant.bindingId}`);
