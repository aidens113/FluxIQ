import { z } from "zod";
import { appFields, appUniqueList } from "../validation/index.ts";
import { appGrantListSchema } from "../grants/index.ts";
import { appOperationSchema } from "../operation/index.ts";
import { appPinSchema } from "./pin.ts";
import { appFrontendSchema } from "./frontend.ts";
import { appRequirementsSchema } from "./requirements.ts";

export const appManifestShape = appPinSchema.omit({ manifestDigest: true }).extend({
  schemaVersion: z.literal(1),
  frontend: appFrontendSchema,
  operations: appUniqueList(appOperationSchema, value => value.id, 64).refine(values => values.length > 0),
  requestedGrants: appGrantListSchema,
  requirements: appRequirementsSchema,
  compatibility: z.object({ appProtocolVersion: z.literal(1), minimumCoreVersion: appFields.version }).strict(),
  updatePolicy: z.enum(["pinned", "consent-required"])
}).strict();
export type AppManifestContentV1 = z.infer<typeof appManifestShape>;
