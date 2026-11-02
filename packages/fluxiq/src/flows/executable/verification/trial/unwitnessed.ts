/** The packet's note of the steps with no witness (header): each by its label and the trial steps it acted at. */

export type TrialSiteChangeUnwitnessed = { steps: Array<{ label?: string; ranAs: number[] }>; parts: string[]; said: string; omitted?: number };
