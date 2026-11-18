import { z } from "zod";

export const appFields = {
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/u),
  operationId: z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/u),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  version: z.string().max(128).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u),
  epoch: z.number().int().nonnegative().safe(),
  generation: z.number().int().min(1).safe(),
  environment: z.enum(["local", "self-hosted", "cloud"])
};
