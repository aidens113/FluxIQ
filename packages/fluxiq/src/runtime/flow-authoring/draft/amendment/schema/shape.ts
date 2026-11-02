import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE } from "../../route-places/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES } from "../changes/index.ts";
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["step", "change"],
    properties: {
        step: { type: "integer", minimum: 1 },
        change: {
            enum: [...AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES]
        },
        settings: { type: "object" },
        to: { type: "integer", minimum: 1 },
        input: { type: "object" },
        check: { type: "integer", minimum: 1 },
        through: { type: "integer", minimum: 1 },
        over: { type: "integer", minimum: 1 },
        while: { type: "integer", minimum: 1 },
        most: { type: "integer", minimum: 1, maximum: 10000 },
        act: { type: "string", pattern: "^a[1-9][0-9]{0,2}([.][a-z]{1,16})?$" },
        place: { type: "string", pattern: AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE.source }
    }
} satisfies JsonObject;
