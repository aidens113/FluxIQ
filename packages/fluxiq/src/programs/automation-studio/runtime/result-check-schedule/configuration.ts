// A Flow's result checking, as one stored thing: the curve, and the standing
// permission that pays for it.
//
// They are kept as two objects rather than one because they are two different
// kinds of fact. The schedule is a pure policy input -- a shape and four
// numbers, safe to log, safe to show, decided by `decide.ts` with no side
// effect. The authorization names a key and a spending limit, and is the only
// part of this a person is really consenting to. Flattening them into one
// record would put a credential reference into the type every schedule test
// constructs.
//
// They travel together because they are configured together: the settings view
// shows one switch, "Check that results are right", and turning it on writes
// both. This is the shape `flow_settings.training_json` holds, under
// `metadata.trainingModeSettings.resultCheck`.

import type { AutomationStudioResultCheckAuthorization } from "../result-check-authorization/index.ts";
import type { AutomationStudioResultCheckSettings } from "./settings.ts";

export type AutomationStudioResultCheckConfiguration = {
  schedule: AutomationStudioResultCheckSettings;
  /** Absent until a person turns checking on; without it an unattended run obtains no model. */
  authorization?: AutomationStudioResultCheckAuthorization;
};
