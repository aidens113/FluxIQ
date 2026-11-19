import type { PlanOffer } from "./types";

/** What a plan sells, in words: "2 dedicated browsers and 5 seats". */
export function describePlan(plan: PlanOffer): string {
  const parts = plan.lines.map((line) => {
    if (line.unit === "dedicated-browser") return `${line.quantity} dedicated browser${line.quantity === 1 ? "" : "s"}`;
    if (line.unit === "seat") return `${line.quantity} seat${line.quantity === 1 ? "" : "s"}`;
    return "the hosted service";
  });
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
