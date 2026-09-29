import type { OnboardingStartOption } from "./types";

/**
 * The words the first-run view says, from the MVP plan: one line on what
 * FluxIQ does with AI, and the three ways to start.
 */
export const ONBOARDING_COPY = {
  valueMessage: "FluxIQ uses AI to build and adapt your automation, then reuses what it learns so routine runs can execute without repeatedly relying on AI.",
  startOptions: [
    { id: "describe", label: "Describe an automation", description: "Say what you want done and FluxIQ builds it." },
    { id: "demonstrate", label: "Show FluxIQ how", description: "Record yourself doing it once in the browser." },
    { id: "extract", label: "Extract data from this page", description: "Pull a table or list from the page you are on." }
  ] as const satisfies readonly OnboardingStartOption[]
} as const;
