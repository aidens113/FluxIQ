import type { AutomationStudioInputHead } from "./head.ts";

export type AutomationStudioInputState = Readonly<{ ownerId: string; head?: AutomationStudioInputHead }>;
