// A real service driven as a caller drives it from code (fluxnode-plan P2): each generation takes the
// caller's options of the moment, and drops the flags the chat sends, since the options must be enough.
// Options of `undefined` are a call that brought none, as a person's press in the panel is.

import { AutomationStudioService } from "../../../../service.ts";
import type { AutomationStudioAnswerFirstCallerOptions, AutomationStudioGenerateFlowBootstrapAdaptationInput } from "../../../flow-bootstrap-commands/index.ts";

export function drivenBy(service: AutomationStudioService, options: () => AutomationStudioAnswerFirstCallerOptions | undefined): void {
  const own = AutomationStudioService.prototype.generateFlowBootstrapAdaptation;
  Object.assign(service, {
    generateFlowBootstrapAdaptation: (input: AutomationStudioGenerateFlowBootstrapAdaptationInput) => {
      const given = options();
      if (!given) return own.call(service, input);
      const { evidenceGuided: _guided, authoringMode: _mode, ...plain } = input;
      return own.call(service, plain, given);
    }
  });
}
