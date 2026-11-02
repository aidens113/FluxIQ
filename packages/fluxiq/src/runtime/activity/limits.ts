/**
 * The bounds on every activity event (D4 of the live activity plan): string
 * lengths match what `ClientGatewayActivity` promises its readers, and
 * `recent` is how many events one project's snapshot keeps.
 */
export const AUTOMATION_STUDIO_ACTIVITY_LIMITS = { label: 160, title: 160, text: 1_000, recent: 60 } as const;
