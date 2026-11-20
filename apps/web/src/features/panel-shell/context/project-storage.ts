// Where the chosen project is remembered across a reload: this browser's local storage, which a private
// window or a blocked profile may refuse. A refusal is an answer of its own (`ok: false`), never read as
// "nothing remembered", so the caller says what could not be done and goes on without.

export const PROJECT_STORAGE_KEY = "fluxiq-panel-project";

export type StorageResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const REFUSED = "This browser does not let FluxIQ keep the chosen project.";

function open(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function readStoredProject(): StorageResult<string | undefined> {
  try {
    const value = open()?.getItem(PROJECT_STORAGE_KEY)?.trim();
    return { ok: true, value: value || undefined };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? `${REFUSED} ${error.message}` : REFUSED };
  }
}

/** Remembers `projectId`, or forgets the choice when it is undefined. */
export function storeProject(projectId: string | undefined): StorageResult<undefined> {
  try {
    if (projectId === undefined) open()?.removeItem(PROJECT_STORAGE_KEY);
    else open()?.setItem(PROJECT_STORAGE_KEY, projectId);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? `${REFUSED} ${error.message}` : REFUSED };
  }
}
