import type { AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS } from "./endings.ts";

export type AutomationStudioProjectBuildEnding = {
  outcome: (typeof AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS)[number];
  reason: string;
  at: number;
};
