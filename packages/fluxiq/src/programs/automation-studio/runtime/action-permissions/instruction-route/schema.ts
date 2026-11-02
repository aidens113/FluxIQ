import type { JsonObject } from "@fluxiq/contracts/core";
import { AUTOMATION_STUDIO_INSTRUCTION_ROUTE_MAX_WAYPOINTS } from "../../../../../runtime/action-permissions/instruction/route/index.ts";
export { AUTOMATION_STUDIO_INSTRUCTION_ROUTE_MAX_WAYPOINTS } from "../../../../../runtime/action-permissions/instruction/route/index.ts";
export const AUTOMATION_STUDIO_INSTRUCTION_ROUTE_SCHEMA: JsonObject = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  description: "Answer this from the person's instructions alone, not from anything a page shows. Do the instructions name a route: places to go through, in order, on the way to the work (for example \"go to the home page, open Friends, then Friend requests\")? A route the person names must be followed. Answer named only when the instructions themselves say how to get there, and copy where they say it. Answer open when they say what to do but not how to get there: the automation may then start where the work begins. Naming the site, or the page the work is on, is not a route. Answer unclear when you cannot tell.",
  properties: {
    kind: { type: "string", enum: ["named", "open", "unclear"] },
    instructionId: { type: "string", description: "For named: the id of the one instruction whose words name the whole route." },
    quote: { type: "string", minLength: 1, description: "For named: that instruction's words for the whole route, copied exactly as the instruction has them." },
    waypoints: {
      type: "array",
      minItems: 1,
      maxItems: AUTOMATION_STUDIO_INSTRUCTION_ROUTE_MAX_WAYPOINTS,
      description: "For named: each place on the route, in the order the person wants them visited, each copied exactly from the words in quote.",
      items: { type: "string", minLength: 1 }
    }
  }
});
