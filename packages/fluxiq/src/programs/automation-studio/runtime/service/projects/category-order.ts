import type { AutomationStudioProjectCategory } from "../../../api/contracts.ts";
import { normalizeProjectCategories } from "./store.ts";

// The order a newly created project category takes.

export function nextCategoryOrder(categories: AutomationStudioProjectCategory[]): number {
  if (!categories.length) return 0;
  return Math.max(...normalizeProjectCategories(categories).map((category) => category.order)) + 1;
}
