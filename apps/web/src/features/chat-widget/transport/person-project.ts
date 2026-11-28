import type { ChatResult } from "@fluxiq/ui-components";

/**
 * Where a chat with no project open starts: the person's own project, as Core's first-project finds it
 * (their latest own, else a first one Core makes for them). The extension's chat starts there too, so a
 * person never has to make or choose a project before they can write.
 */
export type PersonProject = {
  /** The person's project, or why there is none. */
  find(): Promise<ChatResult<string>>;
  /** Hears the project a chat was just started in, once the start succeeded, so the host can open it. */
  found?(projectId: string): void;
};
