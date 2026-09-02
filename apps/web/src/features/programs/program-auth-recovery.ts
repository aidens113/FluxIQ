"use client";

export const programAuthenticationRequiredEvent = "program-api:authentication-required";

let pendingRecovery: Promise<boolean> | null = null;
let settlePendingRecovery: ((authenticated: boolean) => void) | null = null;

export function requestProgramAuthentication(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (pendingRecovery) return pendingRecovery;
  pendingRecovery = new Promise<boolean>((resolve) => {
    settlePendingRecovery = resolve;
  });
  window.dispatchEvent(new CustomEvent(programAuthenticationRequiredEvent));
  return pendingRecovery;
}

export function resolveProgramAuthentication(authenticated: boolean): void {
  const settle = settlePendingRecovery;
  settlePendingRecovery = null;
  pendingRecovery = null;
  settle?.(authenticated);
}

export function hasPendingProgramAuthentication(): boolean {
  return pendingRecovery !== null;
}
