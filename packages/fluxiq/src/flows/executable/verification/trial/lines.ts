/** Bounded readable lines, with how many were left out on each side. */

export type TrialSiteLines = { gone: string[]; added: string[]; cut?: { gone: number; added: number } };
