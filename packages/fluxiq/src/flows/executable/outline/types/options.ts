import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowRouter } from "../../../authoring/model/index.ts";
import type { AutomationStudioFlowInterface } from "../../interface/index.ts";
import type { OutlineCallee } from "./callee.ts";
import type { OutlineLink } from "./link.ts";

/**
 * What the outline needs from outside the graph. All of it is optional: a
 * graph alone outlines, with plainer words.
 */
export type FlowOutlineOptions = {
  /** The Flow's interface, when the graph does not carry one. */
  interface?: AutomationStudioFlowInterface;
  /** A domain's sentence for one of its outputs ("Press “Search”"); nothing when it has none. */
  describeOutput?: (outputId: string, params: JsonObject) => string | undefined;
  /** The name of a Flow a step runs, and the lasting classes it can cause. */
  describeFlow?: (link: OutlineLink) => OutlineCallee | undefined;
  /** The Flow's router, stored beside the graph; its routes become arms of a first step. */
  router?: Pick<AutomationStudioFlowRouter, "rules" | "fallback">;
};
