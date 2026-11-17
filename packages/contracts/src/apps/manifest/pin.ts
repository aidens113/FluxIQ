import { z } from "zod";
import { appFields } from "../validation/index.ts";

export const appPinSchema = z.object({ publisherId: appFields.id, appId: appFields.id, version: appFields.version, packageDigest: appFields.digest, manifestDigest: appFields.digest }).strict();
export type AppPin = z.infer<typeof appPinSchema>;
