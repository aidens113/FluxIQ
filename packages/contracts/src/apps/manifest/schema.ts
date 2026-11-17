import { appFields } from "../validation/index.ts";
import { appManifestShape } from "./shape.ts";
import { checkAppManifest } from "./check.ts";
import type { z } from "zod";

export const appManifestSchema = appManifestShape.extend({ manifestDigest: appFields.digest }).superRefine(checkAppManifest);
export type AppManifestV1 = z.infer<typeof appManifestSchema>;
