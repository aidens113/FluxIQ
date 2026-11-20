import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioInputUseOrigin } from "./origin.ts";

/** One layer of a run's actual input assembly, in overlay order. A layer with no declared origin is unknown provenance. */
export type AutomationStudioInputUseLayer = Readonly<{
  role: "inherited" | "caller";
  values: JsonObject;
  origin?: AutomationStudioInputUseOrigin | undefined;
}>;
