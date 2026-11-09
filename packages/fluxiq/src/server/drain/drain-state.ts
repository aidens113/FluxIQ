type DrainGlobal = typeof globalThis & { __fluxiqWebDraining?: boolean };

/**
 * Whether the server has begun shutting down. Held on globalThis because the
 * routes that read it and the runtime that sets it are bundled separately.
 */
export const drainState = Object.freeze({
  isDraining: (): boolean => (globalThis as DrainGlobal).__fluxiqWebDraining === true,
  markDraining: (): void => {
    (globalThis as DrainGlobal).__fluxiqWebDraining = true;
  },
  reset: (): void => {
    delete (globalThis as DrainGlobal).__fluxiqWebDraining;
  }
});
