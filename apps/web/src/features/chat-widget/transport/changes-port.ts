// What the panel itself hears of a change to a conversation or a run, as the
// chat's change feed: a turn written or an ask answered here (or by another
// surface in this tab) reads at once instead of waiting for the poll. The
// poll stays: a turn a server-side run writes reaches this panel in no other
// way, because nothing pushes to it.

import type { ChatChangesPort } from "@fluxiq/ui-components";
import { subscribeToAutomationStudioMutations } from "../../automation-studio/stores";
import type { ProgramChatTransportOptions } from "./options";

export function createChangesPort(options: Pick<ProgramChatTransportOptions, "projectId">): ChatChangesPort {
  return {
    subscribe(listener) {
      return subscribeToAutomationStudioMutations((transaction) => {
        const { mutation } = transaction;
        // A project is open: only its changes matter. None is: the list spans every project, so any change does.
        const project = options.projectId();
        if (project !== undefined && mutation.projectId !== project) return;
        listener(mutation.kind === "conversation.changed" ? { conversationId: mutation.conversationId } : {});
      }, { kinds: ["conversation.changed", "runtime-run.changed"] });
    }
  };
}
