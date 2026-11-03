import { CHAT_PROJECT_NAVIGATION } from "./contracts.ts";

/** Binds project navigation in an extension view, without exposing command execution. */
export function bindChatProjectNavigation(view: EventTarget, openProject: (projectId: string) => void): () => void {
  const navigate = (event: Event): void => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (detail === null || typeof detail !== "object" || Array.isArray(detail)) return;
    const keys = Reflect.ownKeys(detail);
    if (keys.length !== 1 || keys[0] !== "projectId") return;
    const id = (detail as { projectId?: unknown }).projectId;
    if (typeof id !== "string" || id.length === 0 || id.length > CHAT_PROJECT_NAVIGATION.maxProjectIdLength || id !== id.trim() || /[\s\u0000-\u001f\u007f]/u.test(id)) return;
    openProject(id);
  };
  view.addEventListener(CHAT_PROJECT_NAVIGATION.event, navigate);
  return () => view.removeEventListener(CHAT_PROJECT_NAVIGATION.event, navigate);
}
