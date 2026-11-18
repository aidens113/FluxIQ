import { z } from "zod";
import { appFields } from "../validation/index.ts";

/** An installed immutable reference. It carries no executable source or runtime overrides. */
export const appBackendBindingSchema = z.object({ kind: z.enum(["dataset-query", "fluxnode", "pipeline", "flow"]), id: appFields.id, definitionDigest: appFields.digest }).strict();
export type AppBackendBinding = z.infer<typeof appBackendBindingSchema>;
