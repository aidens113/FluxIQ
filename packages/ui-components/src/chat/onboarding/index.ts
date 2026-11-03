// The connected chat's onboarding: what the latest chat's empty state needs
// to know before the person's first request, read without DOM. Today that is
// whether a model key is enabled (`model-readiness.ts`).
export { readModelReadiness, type ModelReadiness } from "./model-readiness.ts";
