// `secret()`: a FluxNode input whose value Core withholds (`format: "secret"` in the contracts). No
// model is shown it -- the goal names the input and Core enters it -- no saved Flow, export or pinned
// file holds it, and every step file, trace, event and result shows `[withheld]` in its place.
//
//   defineFluxNode({ ..., goal: "Sign in as {user} with {password}.",
//     inputs: z.object({ user: z.string(), password: secret() }) });
//
// Only an input declared directly in a FluxNode's `inputs` may be a secret; an output, a pipeline's
// inputs or a nested field is refused, since each is returned or stored as it is.

import { z, type ZodString } from "zod";
import { SECRET_MARK } from "./secret-mark.ts";

/** A string input Core keeps secret. Refine it before or after: `secret(z.string().min(8))`, `secret().max(64)`. */
export function secret(schema: ZodString = z.string()): ZodString {
  return new z.ZodString({ ...schema._def, [SECRET_MARK]: true } as ZodString["_def"]);
}
