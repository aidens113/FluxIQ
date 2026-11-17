// What the panel hears of a change to a conversation or a run, as the chat's
// change feed. Two sources, neither a timer:
//
// - this tab's own writes (a turn written or an ask answered here, or by
//   another surface in this tab), heard at once from the Studio's mutation
//   store, scoped to the chat's project;
// - every other writer -- a run writing a turn, a reply finishing, another tab
//   or person -- heard from the page's one change stream
//   (`features/panel-changes`, `GET /api/panel/changes`), which names only
//   threads the person may read. When the stream opens or opens again, or a
//   change may have been missed, the chat reads once.
//
// That makes the feed complete (`complete: true`): the chat widget runs no
// poll of its own beside it (`@fluxiq/ui-components`, `read-beat.ts`).

import type { ChatChangesPort } from "@fluxiq/ui-components";
import { subscribeToAutomationStudioMutations } from "../../automation-studio/stores";
import { sharedPanelChanges } from "../../panel-changes";
import type { ProgramChatTransportOptions } from "./options";

export function createChangesPort(options: Pick<ProgramChatTransportOptions, "projectId" | "changes">): ChatChangesPort {
  return {
    complete: true,
    subscribe(listener) {
      const stopLocal = subscribeToAutomationStudioMutations((transaction) => {
        const { mutation } = transaction;
        // A project is open: only its changes matter. None is: the list spans every project, so any change does.
        const project = options.projectId();
        if (project !== undefined && mutation.projectId !== project) return;
        listener(mutation.kind === "conversation.changed" ? { conversationId: mutation.conversationId } : {});
      }, { kinds: ["conversation.changed", "runtime-run.changed"] });
      const stopPushed = (options.changes ?? sharedPanelChanges()).subscribe({
        conversation: (conversationId) => listener({ conversationId }),
        opened: () => listener({})
      });
      return () => {
        stopLocal();
        stopPushed();
      };
    }
  };
}
